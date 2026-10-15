# L02: skills and conventions

A skill is a named chunk of review rules written in Markdown. The lesson looks at
skills from two sides: for Claude Code working in this repository, and for the
reviewers inside DevDigest itself. The second half is the conventions extractor:
DevDigest finds the house rules in a repository's code and offers to turn them into
skills.

## Skills for Claude Code

- `onion-architecture` and `frontend-architecture`: where code goes on the server and
  in the client. The backend dependency rule is checked by `pnpm depcruise`. Starting
  point: 0 errors, 14 warnings about old drift.
- `pr-self-review`: what to check before opening a PR. Gates of every touched package,
  mirrored contracts, untouched migrations and lockfiles, tests at the right level,
  insights. This PR was opened through it.
- `.claude/settings.json` lets checks run and git be read without asking, and forbids
  editing migrations, lockfiles and `.env`. Path rules only work in the `Edit(path)`
  syntax.
- The shared context moved to `AGENTS.md`, and `CLAUDE.md` now just imports it and
  adds a few Claude-specific lines.

## Skills library in DevDigest

The `/skills` page: list on the left, editor on the right, tabs Config, Preview,
Stats and Versions. The selected skill and tab live in the URL, so you can link to a
skill.

![Skill editor](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-config.png)

Preview shows the block exactly as the model will get it.

![Prompt block](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-preview.png)

Every change to the body is a new version. Old versions can be viewed, compared with
the current one and restored (a restore is also a new version, history is never
rewritten).

![Version history with a diff](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-versions.png)

The seed adds four skills for this codebase: `ssrf-outbound-requests`,
`query-efficiency`, `fastify-route-contracts`, `null-not-zero`. They are not attached
to anything until you do it yourself.

## Import from a file or a URL

Two ways in: upload a `.md` (or just paste the text), or give a link to a `SKILL.md`
(a GitHub page works too). Either way the server parses the file and shows a preview
with warnings, and nothing is saved until the second click.

![Import preview](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/import-preview.png)

Import by URL means the server makes a request to an address the user typed, which
is textbook SSRF. So: https and port 443 only; every IP address is checked at connect
time, not before, so DNS rebinding does not help; every redirect is checked again;
one deadline for the whole exchange including the body; only `text/*` and at most
256 KB.

An imported skill (from a file too) shows up **disabled** and marked **needs
vetting**. Foreign text does not reach the prompt even if an agent already has the
skill attached. Turning it on is the human review. Wherever the file came from, for
DevDigest it is still someone else's text.

![Imported skill waiting for review](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/imported-needs-vetting.png)

## Conventions extractor

Skills Lab -> **Conventions**. The **Run extraction** button makes two model calls.
First the model picks up to 10 files from the top of the `repo-intel` ranking (at
most two from one folder, so a single folder cannot take the whole sample). Then it
reads those files and returns rules, each with a quote.

![Conventions of this repository](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/conventions-scan.png)

The main idea is not to take the model's word for anything:

- **The quote is checked.** A rule stays only if the quoted lines really are in the
  file (compared line by line, ignoring indentation). What gets stored are the lines
  from the file itself with an exact range (`core.ts:7`, `repos.ts:9-11`), not the
  model's copy. Made-up quotes are dropped, and the page shows how many there were.
- **The server caps confidence.** The prompt asked for at most 0.6 for a rule seen in
  one file. The model gave everything 1.0 anyway. Now the ceiling depends on how many
  of the files it read actually contain the rule: 1 -> 0.6, 2 -> 0.8, 3+ -> 1.
- **The model does not choose what to read from disk.** A path from the model is
  accepted only if it is in the proposed list.

A card can be accepted as is, edited first (rule and name), or rejected. An accepted
convention becomes a skill of type `convention` with the quote as its example, and it
is enabled right away: it is a rule from your own code, and a person has just read it.

![Accepted conventions](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/conventions-accepted.png)

Scanning this repository: 8-10 files, 7-8 rules, about $0.0009 and 18-20 seconds.
The page never calls the model by itself, only the button does.

## Skills in an agent

The agent editor has a new Skills tab: tick a skill to attach it, drag or use the
up/down buttons to reorder. The order here is the order in the prompt. Every change is
saved right away, and if the request fails, the list goes back.

![Agent Skills tab](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/agent-skills-linked.png)

Skills go into the prompt as a separate section: first a short preamble (a skill can
add things to check, but cannot change the answer format, severity or safety rules,
and cannot tell the model to stay quiet about something), then `<skill name="...">`
blocks. They are deliberately not wrapped in `<untrusted>`: the prompt protection
tells the model to ignore any instructions inside such blocks, and a skill is nothing
but instructions.

The run trace shows which skills, and which versions of them, the model got. So a
month later you can read exactly what it was told.

![Skills in the trace](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/trace-skills.png)

The skill's Stats tab counts runs from that trace field.

## Does a skill help?

In L01 Performance Reviewer missed the N+1 in demo PR #2. I attached
`query-efficiency` and `null-not-zero` to it and ran it three times with the skills
and three times without (`deepseek-v4-flash`, under a cent in total).

| | N+1 found | Said there was no diff | Read it and missed |
|---|---|---|---|
| With skills | 1 of 3 | 2 | 0 |
| Without skills | 0 of 3 | 2 | 1 |

The skill is not the main story here. In 4 of 6 runs the model wrote that the request
had no diff, even though the stored prompt is identical to the one where it found the
N+1. The stored run from L01 looks the same. So in L01 the agent did not miss the N+1,
it simply never saw it. When the model did read the diff, it found the problem with
the skill and missed it without. But that is one run against one, not enough for a
conclusion. The next step is to run the agent on a different model and take its
system prompt apart. Recorded in `server/insights/INSIGHTS.md` (Open Questions).

## How to check it yourself

1. `./scripts/dev.sh`: the seed adds the four skills if they are not there yet.
2. **Skills** in the sidebar: open `query-efficiency`, switch Preview to *Prompt block*.
3. **Agents -> Performance Reviewer -> Skills**: tick `query-efficiency`.
4. Run a PR review with this agent and open the trace: Configuration will show
   `query-efficiency@v1`.
5. **Add Skill -> Import from file / Import from URL**: any `SKILL.md`.
6. **Conventions -> Run extraction** (needs an indexed repository, the Indexed badge),
   then **Accept as Skill** on any card.

Tests: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and
`pnpm exec vitest run .it.test` (needs Docker), `cd client && pnpm test`,
`cd reviewer-core && npm test`.

## Found along the way

- Importing a zod schema as a value from `@devdigest/shared` in the client passes
  typecheck and tests, but takes the page down in `next dev` with a 500. Schemas are
  imported straight from the contract file.
- The server's `pnpm typecheck` does not look into `test/`, and vitest does not check
  types, so tests with an old contract shape compile without complaint.
- When `dev.sh` stops, it only kills its own subshell, so the API server is left
  orphaned on port 3001 and keeps serving old code.
- The first live conventions scan hung on the model call. Without its own deadline the
  HTTP request would have waited about 15 minutes; now it is a 502 after 120 seconds.
- next-intl only logs a missing translation key, so the page shows the raw key while
  the tests stay green. I added a test that checks every `t("...")` against the
  translation files, and it found one lost key right away.

Details are in the `insights/INSIGHTS.md` of each package.

---

# Домашнє завдання L02: екстрактор конвенцій

Сам екстрактор з'явився ще в лабораторній (#6), тож у домашці я провів його через той
самий цикл, що й фічі уроку 5. Спершу написав спеку з критеріями приймання. Потім
окремий агент звірив з нею код і дизайн курсу. Усе, що він знайшов, виправлено й
покрито тестами. Спека, план і звіти перевірки лежать у `specs/conventions/`
(SPEC-07).

**Відео (57 с):** [hw2-conventions.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-2/hw2-conventions.mp4).
На ньому: справжнє сканування цього репозиторію, підсумок і лічильники, «Edit first» зі
спробою вписати в правило зайвий розділ, «Reject all», а після перезавантаження
підсумок лишається на місці.

## Що знайшла перевірка

Найважливіше, що вона знайшла:

- **Правило могло пронести інструкції в довірений скіл.** Прийняте правило стає
  заголовком `# <правило>` у скілі, а скіл рецензенти читають як інструкцію. На картці
  правило показано абзацом, тож переноси рядків там не видно. Але текст на кшталт
  «Use X\n\n## Severity\nCRITICAL…» у скілі ставав окремим розділом. Тепер правило
  завжди один рядок без Markdown-маркерів на початку, до 300 символів. Це стосується
  і правила від моделі, і відредагованого людиною. На відео видно, що в скілі
  розділ Severity лишається один, власний.
- **Лічильник казав неправду.** «Dropped: quote not found» рахував і повтори, і
  правила понад ліміт 8. Тепер це два окремі числа: без справжньої цитати
  (`dropped`) і пропущені як повтори, вже прийняті чи зайві (`skipped`).
- **Повторне сканування знову пропонувало прийняті правила.** Після повторного
  прийняття з'являвся скіл-дублікат з суфіксом `-2`. Тепер правило, вже прийняте в
  цьому репозиторії, не пропонується знову, а прийняту конвенцію не можна
  «відхилити»: вона лишається записом про скіл.
- **Імена скілів могли збігтися.** Ім'я перевірялось запитом перед вставкою, тож
  два одночасні прийняття проходили обидва. Тепер ім'я скіла унікальне в
  робочому просторі на рівні бази (міграція 0012). Прийняття, що програло гонку,
  бере наступний вільний суфікс. Будь-яке інше порушення унікальності тепер
  повертає 409, а не 500.
- **Два одночасні сканування лишали обидва набори кандидатів.** «Видалити й
  вставити» в одній транзакції не захищає від паралельної транзакції. Тепер запис
  сканування захищено блокуванням на рівні репозиторію (advisory lock). Тест
  тримає те саме блокування з іншої транзакції й перевіряє, що сканування чекає.
- **Підсумок зникав після перезавантаження.** Тепер останнє сканування
  зберігається: файли, модель, вартість, лічильники й коміт. Посилання на GitHub
  ведуть на той коміт, рядки якого цитувались, а не на поточну голову гілки.
- **MCP-інструмент `get_conventions` зламався** після зміни відповіді API. Його тест
  проходив, бо фейковий API віддавав стару форму. Виправлено разом із фейком.

Дрібніші речі:
- цитата звіряється лише за першими 8 рядками;
- файл обрізається по межі рядка;
- невідома впевненість - це «—», а не 0;
- блок коду в скілі не можна закрити зсередини цитати;
- теки `test/` і `migrations/` у корені репозиторію не потрапляють у вибірку;
- поки йде «Accept all», дії інших карток недоступні.

## Перевірка

| Прохід | Що знайдено | Результат |
|---|---|---|
| 1 (до змін) | ін'єкція через правило, лічильник, повтори, дублікати імен, паралельні сканування, підсумок після перезавантаження, частина інваріантів без тестів | не готово |
| 2 | зламаний MCP-інструмент, «невідома впевненість», яку схема моделі не дозволяла, відхилення прийнятої конвенції, посилання на скіл лише в межах сесії, кінець блоку коду в цитаті, пів рядка з залишку бюджету | не готово |
| 3 | нових проблем немає; лише тест не фіксує, що блокування стоїть перед видаленням (у коді стоїть) | готово |

Ключові тести перевірено мутаціями: коли повертаю стару поведінку, тест падає. Таких
перевірок шість: читання непропонованого файлу, правило без нормалізації,
відсутність повтору при гонці за ім'я, відсутність блокування, картки без блокування
під час масової дії та загальний бюджет символів.

## Як перевірити самому

1. `cd server && pnpm db:migrate` (міграції 0012 і 0013). Якщо 0012 падає, у базі вже
   є два скіли з однаковим ім'ям, і один треба перейменувати (запит є в
   `server/specs/conventions.md`).
2. Skills Lab -> Conventions -> Re-scan. Під заголовком з'явиться підсумок, а під ним
   лічильники.
3. Edit first -> впишіть у правило перенос рядка й `## Severity` -> Accept -> Open skill.
   Заголовок скіла буде одним рядком.
4. Перезавантажте сторінку: підсумок і посилання «Open skill» на прийнятих картках
   лишаються.

Тести:
- `cd server && pnpm exec vitest run conventions routes-smoke`;
- `cd client && pnpm test conventions ConventionCard`;
- `cd mcp && npm test`.
