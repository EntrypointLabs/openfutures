import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, after, beforeEach, test } from "node:test";

const exec = promisify(execFile);
let directory = "";
let available = true;
try {
  await exec("initdb", ["--version"]);
} catch {
  available = false;
}
let started = false;
async function sql(statement: string) {
  const { stdout } = await exec("psql", [
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    directory,
    "-p",
    "55439",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-c",
    statement,
  ]);
  return stdout.trim();
}
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const user = (n: number, verified = true) =>
  `insert into auth.users values ('${id(n)}', ${verified ? "now()" : "null"});`;
const joinMember = (n: number, username: string, code: string | null = null) =>
  `select public.create_waitlist_membership('${id(n)}', '${username}', ${code ? `'${code}'` : "null"});`;
before(async () => {
  if (!available) return;
  directory = await mkdtemp(join(tmpdir(), "of-waitlist-pg-"));
  await exec("initdb", ["-D", directory, "-U", "postgres", "-A", "trust", "--no-locale"]);
  await exec("pg_ctl", [
    "-D",
    directory,
    "-l",
    join(directory, "server.log"),
    "-o",
    `-F -k ${directory} -p 55439 -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  started = true;
  await sql(
    // A real project grants service_role usage on auth but no read grant on auth.users.
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz); grant usage on schema auth to service_role;",
  );
  await sql(
    await readFile(
      new URL("../supabase/migrations/202610160001_waitlist.sql", import.meta.url),
      "utf8",
    ),
  );
});
after(async () => {
  if (started) await exec("pg_ctl", ["-D", directory, "-m", "immediate", "-w", "stop"]);
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  if (available) await sql("truncate public.waitlist_members, auth.users cascade;");
});
const options = {
  skip:
    !available &&
    "Postgres binaries unavailable; install PostgreSQL to run isolated database tests.",
};
test(
  "database: only verified users join; case-insensitive usernames and collision recovery",
  options,
  async () => {
    await sql(user(1, false));
    await assert.rejects(
      sql(`set role service_role; ${joinMember(1, "first")}`),
      /unverified_user/,
    );
    await sql("update auth.users set email_confirmed_at=now()");
    // service_role cannot read auth.users directly; the privileged helper must do it.
    await assert.rejects(
      sql("set role service_role; select 1 from auth.users"),
      /permission denied/,
    );
    await sql(`set role service_role; ${joinMember(1, "First")}`);
    await sql(user(2));
    await assert.rejects(sql(joinMember(2, "first")), /username_taken/);
    assert.equal(await sql("select count(*) from public.waitlist_members"), "1");
    await sql(joinMember(2, "second"));
    assert.equal(await sql("select count(*) from public.waitlist_members"), "2");
    await assert.rejects(sql(`${user(3)} ${joinMember(3, "bad space")}`), /invalid_username/);
  },
);
test(
  "database: concurrent retries credit an inviter exactly once and cannot change permanent membership",
  options,
  async () => {
    await sql(`${user(1)} ${user(2)} ${joinMember(1, "inviter")}`);
    const code = await sql(
      `select referral_code from public.waitlist_members where user_id='${id(1)}'`,
    );
    assert.match(code, /^[A-Z0-9]{8}$/);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        sql("set role service_role; " + joinMember(2, "friend", code)),
      ),
    );
    const ownCode = await sql(
      `select referral_code from public.waitlist_members where user_id='${id(2)}'`,
    );
    await sql(joinMember(2, "changed", ownCode));
    await sql(joinMember(1, "changed", ownCode));
    assert.equal(await sql("select count(*) from public.waitlist_members"), "2");
    assert.equal(
      await sql(
        `select username || ':' || referral_code from public.waitlist_members where user_id='${id(2)}'`,
      ),
      `friend:${ownCode}`,
    );
    assert.equal(
      await sql(`select referral_count from public.waitlist_ranking where user_id='${id(1)}'`),
      "1",
    );
    assert.equal(
      await sql(`select referred_by is null from public.waitlist_members where user_id='${id(1)}'`),
      "t",
    );
  },
);
test("database: concurrent username claims produce a single winner", options, async () => {
  await sql(`${user(1)} ${user(2)}`);
  const results = await Promise.allSettled([
    sql(joinMember(1, "same")),
    sql(joinMember(2, "SAME")),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await sql("select count(*) from public.waitlist_members"), "1");
});
test(
  "database: rankings, pages, activity privacy, invalid attribution and SQL privileges",
  options,
  async () => {
    await sql(
      `${user(1)} ${user(2)} ${user(3)} ${joinMember(1, "first")} ${joinMember(2, "second", "INVALID1")}`,
    );
    const code = await sql(
      `select referral_code from public.waitlist_members where user_id='${id(2)}'`,
    );
    await sql(joinMember(3, "friend", code));
    // Equal timestamps must fall back to stable UUID order.
    await sql("update public.waitlist_members set joined_at='2026-01-01T00:00:00Z'");
    const board = JSON.parse(
      await sql(`set role service_role; select public.waitlist_leaderboard('${id(1)}', 0, 2)`),
    ).items;
    assert.deepEqual(
      board.map((m: any) => m.username),
      ["second", "first"],
    );
    assert.deepEqual(Object.keys(board[0]).sort(), ["count", "isYou", "rank", "username"]);
    const next = JSON.parse(await sql(`select public.waitlist_leaderboard('${id(1)}', 2, 2)`));
    assert.equal(next.nextOffset, null);
    assert.equal(next.items[0].username, "friend");
    const me = JSON.parse(await sql(`select public.waitlist_me('${id(2)}',0,5)`));
    assert.equal(me.member.count, 1);
    assert.equal(me.member.rank, 1);
    assert.deepEqual(Object.keys(me.activity.items[0]), ["at"]);
    const blank = JSON.parse(await sql(`select public.waitlist_me('${id(4)}',0,5)`));
    assert.equal(blank.member, null);
    assert.deepEqual(blank.activity.items, []);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        sql(`set role ${role}; select * from public.waitlist_members`),
        /permission denied/,
      );
      await assert.rejects(
        sql(`set role ${role}; select * from public.waitlist_ranking`),
        /permission denied/,
      );
      await assert.rejects(
        sql(`set role ${role}; ${joinMember(1, "hacked")}`),
        /permission denied/,
      );
      await assert.rejects(
        sql(`set role ${role}; select public.waitlist_me('${id(1)}')`),
        /permission denied/,
      );
    }
  },
);
