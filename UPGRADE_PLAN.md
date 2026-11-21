# Quiz application upgrade plan

## Current state

The current application is a Flask application with server-rendered static HTML, CSS, and JavaScript. Quiz generation calls the OpenAI API, while activity and drafts are stored in browser `localStorage`; user accounts are stored in `users.json`. The quiz player is being previewed separately before changing the existing interface.

## Proposed target architecture

| Area | Target | Responsibility |
| --- | --- | --- |
| Frontend | Angular 22 | Quiz creation, document upload, quiz player, progress, account screens |
| Backend | FastAPI | Authentication, upload/extraction, generation, validation, quiz/history APIs |
| AI | OpenAI API | Draft questions and explanations from extracted source text |
| PDF extraction | PyMuPDF | Extract source text and page references |
| Validation | Python rules plus AI review | Enforce schema and source support; flag ambiguous questions |
| Database | PostgreSQL | Users, source documents, quizzes, questions, attempts, answers |
| Quiz interface | Interactive MCQ | Choice selection, hints, navigation, submission, score, explanations |

## Migration sequence

1. **Review and approve the UI preview.** Open `/quiz-preview` in the running app or open `quiz-preview.html` directly. The page is a working UI prototype with sample content. It does not upload files or call the AI service.
2. **Confirm quiz flow and data fields.** Agree on quiz lengths, question/choice formats, hints, answer explanations, and whether users need saved attempts. Keep the existing Flask application available during migration.
3. **Create a FastAPI service alongside Flask.** Add health, authentication, upload, quiz-generation, quiz-list, and attempt endpoints. Keep API response models explicit so the Angular client and Python rules use the same schema.
4. **Add PDF ingestion with PyMuPDF.** Limit file size and page count, extract text with page references, and report scanned/image-only PDFs clearly. PyMuPDF extraction may need OCR for scanned documents.
5. **Build deterministic validation before accepting a quiz.** Validate question count, unique choices, one valid answer, non-empty explanations, and source references. Ask the model to draft against source passages; reject or retry items that fail checks. AI review is an additional signal, not the only validation.
6. **Add PostgreSQL and migrations.** Model users, source documents, quizzes, questions, attempts, and selected answers. Move accounts from `users.json` and browser history into the database after a backup and migration check.
7. **Connect the Angular 22 client.** Build the approved screens as Angular components, connect them to FastAPI, and add loading, empty, validation-error, and retry states.
8. **Run a staging review.** Check login, PDF upload, generated-question quality, answer scoring, mobile layout, and migration rollback before replacing the current app.
9. **Switch over after approval.** Deploy the new frontend and API, retain a database backup, and keep a rollback path to the current Flask version until the new flow is stable.

## Review gates

- **Gate A — UI:** approve the quiz player and creation flow before starting the Angular rebuild.
- **Gate B — behavior:** approve generated quiz quality, validation rules, and persistence behavior in staging.
- **Gate C — cutover:** approve deployment only after reviewing the migrated data and staging results.

## Initial API shape

- `POST /api/v1/documents` — upload PDF and return extracted text metadata.
- `POST /api/v1/quizzes` — generate and validate a quiz from a source document.
- `GET /api/v1/quizzes/{quiz_id}` — load quiz questions without answer keys before submission.
- `POST /api/v1/quizzes/{quiz_id}/attempts` — submit selected choices and return score and explanations.
- `GET /api/v1/quizzes` — list the signed-in user's saved quizzes.

Keep the answer key server-side until the attempt is submitted. Store the source page/paragraph for each question so reviewers can inspect why an answer is considered correct.

## Environment and operational notes

- Keep `OPENAI_API_KEY`, database credentials, and session secrets out of source control.
- Add a PostgreSQL connection URL and migration tool before persisting production records.
- Treat uploaded source documents and extracted text as private user data; enforce authentication, file limits, and retention/deletion rules.
- The current Angular 22 compatibility requirements include supported Node.js and TypeScript versions; select these when creating the frontend workspace.
