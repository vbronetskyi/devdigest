# L05: Spec-Driven Development, Project Context and Onboarding

Both features of the lesson were built with SDD: first a spec with acceptance criteria,
then an independent review of the spec, a plan with traceability, the code, and a
separate check of the code against the spec. The product got two things. Reviewers now
read the specs/ and docs/ of the repository they review. Someone new to a project gets
an onboarding tour built from facts, not made up by a model.

## Pipeline

The subagent set from L03 was rebuilt for SDD:

```
spec-creator -> researcher -> (brainstorm) -> implementation-planner -> implementer -> {architecture-reviewer, security-reviewer, test-writer} -> plan-verifier -> doc-writer
```

- **spec-creator** (new) writes `specs/<feature>/spec.md`: the problem, goals and
  non-goals, numbered criteria in EARS, edge cases, where the inputs come from and how
  to treat foreign text.
- **planner -> implementation-planner** writes `plan.md`, where every task is tied to
  a criterion and a test, plus an AC -> task -> test -> commit matrix.
- **test-writer** derives tests from the spec's criteria, not from the code. A test
  written against a finished implementation passes on a wrong one too.
- spec-creator and implementation-planner can only write inside `specs/`: the same
  `subagent-paths.sh` hook from L03 guards that, now with a `specs` mode.

The spec is committed before the code, and `git log` shows it: `9580b66` (specs) comes
before `5c8e8be` (the first code).

### Reviewing the spec before the code

Before planning, a separate agent on a different model (Sonnet) read both specs with a
checklist: is every criterion atomic and testable, are there contradictions, does it
describe behavior and not implementation. It found about twenty problems, and each of
them would have become a bug. A few of them:

- a document `docs/x.md` could be a symlink to a file outside the repository, and
  reading went through the working copy;
- AC-9 required always adding a rule to the prompt, while AC-11 required the prompt to
  stay unchanged when there are no documents. The two criteria contradicted each other;
- a failed tour regeneration would have overwritten a good tour with a skeleton;
- nothing limited the amount of facts sent to the model, and nobody stripped links from
  the model's prose.

After the fixes there were 22 criteria instead of 13 and 23 instead of 11, and during
verification SPEC-02 got one more, AC-24. The history of changes is in the changelog of
each spec.

## Project Context Folder (SPEC-01)

The Project Context page shows the repository's Markdown from `specs/`, `docs/` and
`insights/` folders at any depth, because DevDigest keeps them per package. On an
agent's Context tab documents get attached, and the order matters. During a review the
attached documents go into that agent's prompt.

![Project Context](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/context-page.png)

![Agent Context tab](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/agent-context-tab.png)

How it works:

- Documents are read from the clone's default-branch commit (`git ls-tree` and
  `git show HEAD:<path>`), not from the working copy and not from the PR head. A PR
  cannot rewrite the spec it is being checked against. Symlinks do not even make it
  into the list.
- Every document goes in its own `<untrusted>` block, and its first line is the path.
  Before the blocks there is a trusted rule: documents describe how the project is
  supposed to work; a contradiction with them is a finding, but they cannot approve a
  PR, lower a severity or remove a finding.
- The budget is 8K tokens per model call. A document that crosses the limit is cut
  with a marker, the following ones are left out, and the log names both. Map-reduce
  gets the same documents in every call.
- The trace shows `specs_read` (even for a failed run) and the Project context block
  itself. The log has the commit the documents were read from.
- In the UI, Markdown from the repository is rendered without HTML and images, and only
  http(s) links are kept.

![Project context block in the trace](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/trace-project-context.png)

### What live runs showed

Security Reviewer with two documents (`server/docs/architecture.md`,
`server/specs/review-flow.md`) read them from `e4f1a7d`, about 1 700 tokens, and found
the CRITICAL SSRF on demo PR #3, same as without them.

General Reviewer with `architecture.md` twice answered that no diff was sent and
approved the PR. The diff was in the prompt, I checked the trace. So I set up a
control experiment on the same PR:

| Where the documents are in the prompt | Runs | Found SSRF | Time |
|---|---|---|---|
| right before the diff | 2 | 0 (both approve 100, said the diff was missing) | 47-234 s |
| no documents | 2 | 2 | 16-20 s |
| at the start of the message, before the PR description | 2 | 2 | 24-27 s |

The sample is small, but the direction is clear, so documents now go first. Before
that, the same trace showed another problem: document headings (`## Modules`,
`## Data`) sat at the same level as `## Diff to review`. Now they are shifted two
levels down. Both changes went into AC-8 of the spec first, and only then into the code.

The result, plainly: in none of these runs did a finding refer to `architecture.md`,
although PR #3 queries the database straight from `routes.ts` and the document forbids
that. The mechanism works, and the documents reach the model. Whether it uses them
depends on the reviewer and the model.

## Onboarding Generator (SPEC-02)

The tour is built map-reduce style. Code collects the facts for free:

- languages and folder structure from the git tree;
- scripts and frameworks from `package.json` (up to ten, least nested first);
- the package manager from the lockfile next to it;
- Docker, Compose and CI, only when the files are there;
- endpoints, cron jobs, file ranks and import chains from the index.

The model gets only these facts, in one `<untrusted>` block, and makes one call. The
server does not trust its answer:

- the five sections always come in the same order;
- the reading path and the chains come from the index, and the model can only label
  the steps; steps it adds on its own are dropped;
- links are built only to files that exist in the commit;
- links, images and HTML are stripped from the prose.

If the model is unavailable, does not finish in 90 s or returns the wrong schema, what
remains is a skeleton built from the facts alone, with the reason. A failed
regeneration does not overwrite a tour the model wrote.

![Onboarding tour](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/onboarding-top.png)

The tour for this repository: 622 files, 28-35 s, $0.0005 on deepseek-v4-flash. The
first run found three problems the tests did not catch:

- `styles.ts` and `constants.ts` got into the reading path, because PageRank piles up
  in files that import nothing themselves;
- the model suggested `pnpm install` at the root, as if it were a workspace, which it
  is not;
- for e2e it gave `pnpm`, although that package uses npm.

Style, constant and type modules are now excluded from the reading path (AC-9 was
updated first), and the prompt requires taking the manager of each package separately.
The second run fixed all of that.

![How to run and reading path](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/onboarding-reading.png)

The remaining risk is written down in the plan too: numbers and paths inside the prose
are not checked. For example, the model guessed API port 3000 instead of 3001. Only the
links are checked.

## Traceability and verification

In `specs/project-context/plan.md` and `specs/onboarding/plan.md` every criterion has a
task, a test and a commit. At the end a separate agent acting as plan-verifier checked
every AC against the branch's code and tests, not against commit messages. Its reports
are in `verification.md` next to the spec.

| Spec | First pass | What it found | Second pass |
|---|---|---|---|
| SPEC-01 | ready, with gaps | 256 KB was counted in characters, not bytes; the mock did not tell reading from a commit apart from reading the working copy; a few criteria without tests | ready |
| SPEC-02 | **not ready** | up to three model calls instead of one (the adapter retried on its own); the facts limit measured a different text than the one in the prompt; bare URLs got into the prose; the tree was read from HEAD while links pointed to the indexed commit | ready |

The second pass found real things too. An unclosed backtick in the model's answer
could leave a URL outside a code span, so the tour now renders prose with no links at
all. And a resync in the middle of generation could mix two commits, so the tree and
the manifests are now read at a specific sha. Every fix has a test, and the items where
the wording changed are in the spec's changelog.

## Found along the way

- **The Context tab did not open.** The agent page had its own list of allowed tabs
  (`config`, `skills`), so `?tab=context` silently fell back to Config. Component tests
  render the tab directly and did not see it; the check in the browser caught it.
- **Markdown in the UI kit did not style headings and lists.** For documents and the
  tour that matters a lot, so the styles were added, and they apply everywhere the kit
  is used.
- **A run was marked finished before its trace was written.** On a full integration
  run under load, two tests read the trace before it was written. This is an old race
  from L01: the UI could open the trace too early in the same way. Now the trace is
  written first at all three completion points.
- **The clone lags behind `main`.** It sat on the course's starting commit until I ran
  a resync. Project Context shows the state of the default branch that the clone has.

## How to check it yourself

1. `./scripts/dev.sh`, pick an indexed repository in the sidebar.
2. Project Context -> pick a document: the right side shows its content and how many
   agents use it.
3. Agents -> an agent -> Context: tick documents, change the order. A warning appears
   after 4K tokens.
4. Run a review with this agent and open the trace. Specs read and Prompt assembly ->
   Project context show what went into the prompt.
5. Onboarding Tour -> Generate. The footer shows the model, the cost and the index
   commit.
6. Specs, plans and verification reports are in `specs/`.

Tests: `cd server && pnpm exec vitest run context project-context onboarding git-list deadline`,
`cd reviewer-core && npm test`,
`cd client && pnpm test ContextTab DocList DocPanel ContextDocView OnboardingTour MermaidDiagram context/page`.

---

# Домашнє завдання L05: Risk Brief і git-why

Дві фічі, обидві тим самим SDD-конвеєром, що й лабораторна: спека, незалежне рев'ю
спеки, план, код, перевірка коду на відповідність спеці. **SPEC-03 Risk Brief**
відповідає на питання «що може зламатися через цей PR, куди дивитися першим і хто
вже чіпав ці файли». **SPEC-04 git-why** відповідає на «чому цей рядок такий»: хто
і в якому PR його востаннє змінив. Спеки, плани й звіти перевірки лежать у
`specs/risk-brief/` і `specs/git-why/`.

**Відео (78 с):** [hw5-brief-why.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-5/hw5-brief-why.mp4) - генерація брифу на PR #9, розгорнутий ризик, перехід у дифф, історія PR #5 і
git-why на рядку з PR #4.

## Risk Brief (SPEC-03)

Більшу частину брифу рахує код, безкоштовно:

- **Сигнали** - таблиця правил над змінами PR. Міграція, схема БД без міграції,
  маніфест залежностей, lockfile, CI-воркфлоу, шляхи зі словами `auth`, `session`,
  `token`…, роути й публічні контракти (видалені рядки дають medium, лише додані -
  low). Тести й Markdown сигналів не дають.
- **Історія** - інші PR, які вже влилися в default-гілку й чіпали ті самі файли.
  Береться з `git log --first-parent` клону, без lockfile-ів, Markdown і метаданих
  міграцій.

Модель отримує це разом із диффом і робить один виклик: пояснює ризики, ранжує їх,
вибирає до п'яти місць «читати першим» і пише нотатки до історії. Сервер їй не
довіряє:

- посилання на файл лишається, тільки якщо файл є в PR, а рядок - серед рядків,
  які показує дифф (для діапазону - кожен рядок);
- ризик без жодного живого посилання відкидається;
- з тексту прибираються посилання, зображення й HTML;
- сигнал правила лишається, поки модель не накрила його ризиком того ж типу.

Без моделі (немає ключа, не та схема, 90 с) бриф будується з самих сигналів та
історії, з поясненням чому. Невдала регенерація не затирає бриф моделі для того
самого коміту.

![Бриф на demo-PR #3](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-pr3.png)

На demo-PR #3 бриф ставить SSRF першим і веде на рядок з `fetch(req.body.url)`.
Коштує $0.0007-0.0008 на deepseek-v4-flash. Бриф для HW1 (#5, 55 файлів)
коштує $0.0016-0.0018. Його історія показує Lab 1 (#4), який чіпав ті самі
`routes.ts`, контракти й `RunHistory`:

![Бриф з історією, PR #5](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-pr5-history.png)

Відкриття PR моделі не викликає. Поки брифу немає, картка пропонує Generate:

![Порожній стан](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-empty.png)

Кожне посилання в брифі відкриває Files changed на потрібному файлі й рядку
(`?tab=diff&file=…&line=…`). Згорнутий файл розгортається, рядок підсвічується.
Якщо рядка в патчі вкладки немає, сторінка прокручується до самого файлу.

![Перехід з брифу в дифф](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/deep-link.png)

## git-why (SPEC-04)

У Files changed на видаленому чи контекстному рядку при наведенні з'являється кнопка
«why». Сервер робить `git blame` цього рядка на merge base PR, бо саме цю ревізію
показує ліва сторона диффу, а не HEAD default-гілки. Далі він знаходить merge, яким
коміт потрапив у default-гілку. Моделі тут немає, тільки git:

![git-why на рядку з PR #4](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/why-panel.png)

Шлях від користувача доходить до git тільки після перевірки, що це файл PR, і лише
після `--`. Перевірок п'ять, і йдуть вони в такому порядку: схема запиту (422), PR
(404), гілка (409), файл і рядок (404), клон (409). До четвертої git не викликається
взагалі, і тест це перевіряє шпигунами на всіх методах git.

## Що знайшли живі прогони

- **Форк успадковує номери PR апстріму.** Історія PR #5 показала «#11 chore:
  cleanup before home tasks». Це squash-коміт з репозиторію курсу, а #11 у моєму
  форку - відкритий PR лаби 5. Тепер номер із коміту рахується, лише якщо DevDigest
  знає такий PR у цьому репозиторії як merged. Назва береться з DevDigest, а не з
  тексту коміту. Спеку змінено спершу, обидві: AC-4 у SPEC-03, AC-7 у SPEC-04.
- **Кореневий коміт «прийшов» з PR #4.** `rev-list --ancestry-path --merges`
  знаходить пізніші merge-і і для коміту, який сам лежить на mainline. Такий коміт
  тепер не має merge-у, через який прийшов.
- **Модель промахувалась на два рядки.** На PR #3 вона послалась на `routes.ts:175`
  (`headers:`), хоча `fetch` стоїть на 173. Модель рахує рядки від `@@` і збивається.
  Grounding це пропускав, бо 175 теж показаний рядок. Тепер кожен рядок нової
  версії в диффі для моделі має свій номер. Після цього два прогони дали 173 і 14
  (схема тіла запиту) точно. Рецензенти помиляються так само: SSRF-знахідка теж на
  175. Але це промпт reviewer-core, тому я записав це в insights як окрему задачу.
- **Великий PR.** На #5 дифф для моделі обрізано на 12 000 символів, тож для
  файлів, яких модель не бачила, вона дає `:1`. Для нового файлу це справжній рядок,
  тому grounding пропускає. Лікується лише більшим бюджетом на дифф або map-reduce,
  як у рецензентів.

## Перевірка

Після коду окремий агент на Opus у ролі plan-verifier звіряв спеку з кодом і тестами
гілки, а не з повідомленнями комітів. Довелося пройти три кола: кожен прохід
знаходив реальні речі. Повні звіти лежать у `verification.md` поруч зі спеками.

| Прохід | SPEC-03 | SPEC-04 |
|---|---|---|
| 1 | не готово: парсер диффу губив видалені файли, міграції Prisma не ловились, діапазон через два ханки проходив, будь-яка помилка завантаження диффу ставала 409 | не готово: 422 спрацьовував раніше за 404/409 всупереч порядку в спеці, фантомний рядок після фінального `\n`, «why» на маркері `\ No newline` |
| 2 | не готово: тести Go/Python/Ruby давали сигнали, `git diff` віддавав не-ASCII шляхи в лапках з escape-послідовностями, видалені файли коштували зайвий map-виклик у рецензентів | не готово: перевірка існування файлу передавала шлях як `<sha>:<path>`, а не після `--` |
| 3 | одна регресія з другого кола: тека `spec/` вважалась тестами, тож `spec/openapi.yaml` перестав давати сигнал. Виправлено й покрито тестом | готово |

Частина знахідок стосувалась не лише брифу. Парсер диффу з першого дня викидав
видалені файли, тож рецензенти їх не бачили. `git diff` віддавав не-ASCII шляхи в
лапках з escape-послідовностями. Маркер закриття `</untrusted>` екранувався лише в
нижньому регістрі. Усе це виправлено з тестами, а кожна зміна поведінки спершу
записана в changelog спеки.

Свідомо лишилось як є, і це записано в спеках:

- 90-секундний дедлайн не скасовує сам запит до моделі. Так у всіх фічах з моделлю;
  щоб скасовувати, треба протягнути AbortSignal через LLM-порт.
- Дії на рядку диффу доступні лише при наведенні. Так само працює «+» для
  коментаря, а навігація по диффу з клавіатури - окрема фіча.
- Правило за словами в шляху ловить і `tokens.ts` дизайн-системи. Так і задумано:
  правило дивиться лише на слова в шляху.

## Як перевірити самому

1. `./scripts/dev.sh --no-seed`, у сайдбарі вибрати репозиторій з клоном.
2. PR -> Overview -> Risk brief -> Generate. Пігулку можна розгорнути стрілкою.
   Клік по пігулці або по рядку «читати першим» відкриває Files changed на тому
   рядку.
3. History у картці показує інші merged-PR на тих самих файлах.
4. Files changed -> навести на видалений чи контекстний рядок -> why. У PR, що
   йде не в default-гілку, кнопки немає.

Тести:
- `cd server && pnpm exec vitest run brief why git-history grounding`;
- `cd reviewer-core && npm test`;
- `cd client && pnpm test BriefCard WhyPanel DiffTab helpers`.
