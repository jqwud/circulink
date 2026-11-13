# CI/CD: from a push to a published image

Everything is in one file, [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml), and uses only free tools: GitHub Actions, Docker and the GitHub Container Registry (GHCR).

```
 push or pull request
        │
        ▼
 ┌──────────────────────────── CI: runs every time ────────────────────────────┐
 │ server      API lint + all server tests on a real MySQL 8 (rules R1 to R13) │
 │ app         flutter analyze + flutter test                                  │
 │ portal      lint + build                                                    │
 │ containers  docker compose build, start, health check, migrations           │
 │ e2e         portal in a real browser + app screens, on the real API         │
 └───────────────────────────────────┬─────────────────────────────────────────┘
                                     │ all five passed, AND it is a push to main or a v* tag
                                     ▼
 ┌──────────────────────────── CD: publish ────────────────────────────────────┐
 │ build the image from the Dockerfile and push it to ghcr.io/jqwud/circulink  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

## What runs when

| Event | Checks (CI) | Publish (CD) | Image tags |
|---|---|---|---|
| Pull request | Yes | No | none |
| Push to any other branch | Yes | No | none |
| Push to `main` | Yes | Yes, if every check passed | `latest`, `sha-<commit>` |
| Tag `v1.2.3` | Yes | Yes, if every check passed | `1.2.3`, `1.2`, `sha-<commit>` |

## How it meets the lab's three points

1. **Tests guard the pipeline.** `npm test` in `server/` runs the rule tests (`test/rules.test.js`, one group per rule R1 to R13) and the flow tests that try each rule over real HTTP the way someone cheating would. The publish job has `needs: [server, app, containers, portal, e2e]`, so one failing test anywhere means nothing is published.
   Try it: in `server/src/rules.js`, change `reject: 0` to `reject: 1` in `OUTCOME_MULTIPLIER` (rejected junk would then earn points, breaking R5). Push it on a branch and open a pull request. The **server** job goes red and names the failing rule test.
2. **Pull requests are only checked.** The publish job's condition is `github.event_name == 'push'` plus `main` or a `v*` tag, so a pull request, even from a fork, can never push an image. Only that one job has `packages: write`; every other job can only read the code.
3. **Main and version tags are published.** The image goes to GHCR with the tags in the table above. Logging in uses the token GitHub creates for each run (`GITHUB_TOKEN`), so no password is saved anywhere.

Also true, and easy to get wrong:

- **Nothing prebuilt is copied into the image.** The Dockerfile builds the portal in its first stage and copies the result into the second. `portal/dist` is in `.dockerignore`, so a stale build on someone's computer can't end up in the image.
- **The image that is published is the Dockerfile that was tested.** The **containers** job builds the same Dockerfile, starts it with MySQL and checks `/api/health` and the portal page before the publish job is allowed to run.
- **No secrets in the image.** `docker.env` and every `.env` are in `.dockerignore`. The API refuses to start with the example `JWT_SECRET`.

## Releasing a version

```
git tag v1.0.0
git push circulink v1.0.0
```

The pipeline runs the checks on that commit, then publishes `ghcr.io/jqwud/circulink:1.0.0` and `:1.0`.

## Running the published image

```
copy docker.env.example docker.env        (then edit the passwords and JWT_SECRET)
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

This pulls the image instead of building it. `CIRCULINK_TAG=1.0.0` in front (or in the environment) chooses a version; the default is `latest`. The rest is the same as in [`CONTAINERS.md`](CONTAINERS.md).

A new package on GHCR starts **private**. To let anyone pull it (as for this public repository): on GitHub open the repository → *Packages* → *circulink* → *Package settings* → *Change visibility* → *Public*. While it is private, run `docker login ghcr.io` first with a personal access token that has `read:packages`.

## Where to look

- Runs: the repository's **Actions** tab. A published run lists its tags in the run summary.
- Images: the repository's **Packages** section.
- A failing app journey also puts its last lines on the run page as an error note.
