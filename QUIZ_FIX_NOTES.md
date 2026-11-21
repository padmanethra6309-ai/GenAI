# ControlFlowAI Quiz Fix – Follow-up Patch

This patch addresses the diagnostic `Question 1 has no correct answer`.

Changes in `app.py`:
- Accepts answer field aliases including `correctAnswer`, `correctOption`, `answer_letter`, `correctAnswerLetter`, and numeric answer indices.
- Accepts answer objects containing `letter`, `option`, `answer`, `text`, or `value`.
- Accepts a top-level `answer_key`, `answerKey`, or `answers` map/list.
- Matches answer text to option text after normalizing case, spaces, and punctuation.
- Uses up to three generation attempts and tells the model explicitly not to omit answer keys.
- Improves the validation diagnostic by listing the fields received for a question.

The normalizer does not guess a missing correct answer. If the model omits the answer in all attempts, the application reports the actual fields so the model output can be diagnosed instead of silently scoring an unsafe answer.

Tested with synthetic Ollama-style JSON payloads covering option arrays, full-text answers, `correctAnswer`, and top-level answer keys. Python syntax compilation passed.
