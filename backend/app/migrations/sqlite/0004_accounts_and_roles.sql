-- Schema v4: account approval and roles, managed from the dashboard (docs/ARCHITECTURE.md: Accounts).
--
-- SQLite only (Postgres has migrations/postgres/). Applied once by db.init_db() to any database below user_version 4, fresh ones included
-- (db.SCHEMA is the v3 baseline; this file brings it up to date). One transaction: on any
-- error nothing changes and the server refuses to start with the reason.

BEGIN;

-- Who may do what, and whether they may at all.
--   Role:   admin | engineer          (what they can change)
--   Status: pending | active | disabled  (pending: signed up, waiting for an admin; disabled: rejected or switched off)
ALTER TABLE tbl_User ADD COLUMN Role TEXT NOT NULL DEFAULT 'engineer' CHECK (Role IN ('admin', 'engineer'));
ALTER TABLE tbl_User ADD COLUMN Status TEXT NOT NULL DEFAULT 'pending' CHECK (Status IN ('pending', 'active', 'disabled'));
-- "Email me when a work order opens", each user's own switch (profile menu).
ALTER TABLE tbl_User ADD COLUMN NotifyWorkOrders INTEGER NOT NULL DEFAULT 0;

-- Accounts that existed before roles: all keep working. The oldest real account runs the
-- place; the demo account, whose password is public, is switched off.
UPDATE tbl_User SET Status = 'active';
UPDATE tbl_User SET Status = 'disabled' WHERE Username = 'demo';
UPDATE tbl_User SET Role = 'admin', NotifyWorkOrders = 1
 WHERE UserID = (SELECT MIN(UserID) FROM tbl_User WHERE Username <> 'demo');
DELETE FROM tbl_Session WHERE UserID IN (SELECT UserID FROM tbl_User WHERE Status = 'disabled');

-- One account per email address (NULLs allowed: old password accounts may have none).
CREATE UNIQUE INDEX ux_User_Email ON tbl_User(Email COLLATE NOCASE);

-- The audit log gains the admin actions and who did them (ActorID). SQLite can't change a
-- CHECK constraint in place, so the table is rebuilt with every row kept.
CREATE TABLE tbl_AuthEvent_v4 (
  EventID   INTEGER PRIMARY KEY,
  Event     TEXT NOT NULL CHECK (Event IN ('signup', 'login', 'login_failed', 'logout',
                                           'approve', 'reject', 'disable', 'enable', 'role')),
  UserID    INTEGER REFERENCES tbl_User(UserID) ON DELETE SET NULL,  -- whom it was about
  ActorID   INTEGER REFERENCES tbl_User(UserID) ON DELETE SET NULL,  -- the admin who did it (admin actions only)
  Email     TEXT,
  Reason    TEXT,  -- login_failed: password | disabled | cancelled | state | exchange | token | exists;
                   -- role: the new role
  IP        TEXT,
  UserAgent TEXT,
  CreatedAt TEXT NOT NULL
);
INSERT INTO tbl_AuthEvent_v4 (EventID, Event, UserID, Email, Reason, IP, UserAgent, CreatedAt)
  SELECT EventID, Event, UserID, Email, Reason, IP, UserAgent, CreatedAt FROM tbl_AuthEvent;
DROP TABLE tbl_AuthEvent;
ALTER TABLE tbl_AuthEvent_v4 RENAME TO tbl_AuthEvent;
CREATE INDEX ix_AuthEvent_CreatedAt ON tbl_AuthEvent(CreatedAt DESC);
CREATE INDEX ix_AuthEvent_IP ON tbl_AuthEvent(IP, Event, CreatedAt);

PRAGMA user_version = 4;

COMMIT;
