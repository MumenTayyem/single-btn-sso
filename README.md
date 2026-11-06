# Single Admin Entry Point — Local Demo

Three virtual instances on one Liferay server, with Keycloak standing in for
Microsoft Entra ID.

| Host | Role |
| --- | --- |
| `main.localtest.me:8080` | entry instance, hosts the entry router |
| `x.localtest.me:8080` | tenant X |
| `y.localtest.me:8080` | tenant Y |
| `keycloak.localtest.me:8180` | identity provider (admin/admin) |

`*.localtest.me` resolves to 127.0.0.1, so no hosts file changes are needed.

## Users

All passwords are `test`.

| User | Groups | Expected result |
| --- | --- | --- |
| `u.x` | `ENT-X-Admins` | straight into X; refused at Y and main |
| `u.y` | `ENT-Y-Editors` | straight into Y; refused at X and main |
| `u.both` | X and Y | chooser, then the chosen instance |
| `u.central` | main, X and Y | chooser including main |

## Run

1. `docker compose up -d` — the image ships a trial DXP development licence,
   so no activation key is needed.
1. Sign in at `http://localhost:8080` as `test@liferay.com` / `test`, then under
   Control Panel → Security → Service Access Policy edit **SYSTEM_DEFAULT** and
   add `*` to the allowed service signatures. Without this every Headless call
   returns 403 even for an administrator, and these policies are created once at
   instance creation and never updated, so no configuration file can set it.
1. `./provision.sh`
1. Add the **Entry Router** element to the home page of `main.localtest.me`.
1. Open `http://main.localtest.me:8080`.

## How refusal works here

The demo enforces membership in Liferay: `company.security.strangers=false`
plus users pre-provisioned only in the instances they belong to, so a user of X
is refused at Y even though Keycloak authenticated them.

In production the first line of defence is different and stronger — Entra
refuses to issue a token at all for an app the user is not assigned to, so the
request never reaches Liferay. Keep both layers.
