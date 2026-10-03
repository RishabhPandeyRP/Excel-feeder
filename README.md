# RCH Image → Excel

A modular Next.js application that extracts handwritten/printed Hindi or English RCH register images into the exact master-Excel schema using OpenAI vision + Structured Outputs, validates the result, applies deterministic business rules, and downloads an `.xlsx` file.

## Architecture

`image → Sharp preprocessing → OpenAI vision → strict JSON → Zod validation → master-value normalization → repeated-value rule → ExcelJS`

The OpenAI API key is used only on the server. Do **not** put it in browser code or a `NEXT_PUBLIC_*` variable.

## Requirements

- Node.js 20+
- npm
- An OpenAI API key with API usage enabled
- The supplied master workbook copied to `data/master.xlsx`

## Setup

```bash
npm install
cp .env.example .env.local
# Put your key in .env.local
npm run analyze:master
npm run dev
```

Open http://localhost:3000.

## Master workbook

The current project was initialized from the supplied workbook:

`RCH FEEDING 03-10-2026 Karimganj+Dharau.xlsx`

The workbook should remain local and is ignored by git. Run `npm run analyze:master` whenever the master workbook changes. It regenerates `config/master-schema.json` from the workbook.

## Important data rules

1. The AI does not generate an Excel file. It returns structured records.
2. The backend owns the exact 24-column order.
3. Names/proper nouns are transliterated to Latin/English characters.
4. Controlled values are normalized against the master workbook vocabulary.
5. Missing columns remain null/blank; the model is instructed not to invent values.
6. If a cell exactly repeats the value in the immediately preceding row for the same column, the exported value becomes `"`.
7. Repetition is deterministic application logic, not an AI decision.
8. `age` is currently represented by Excel date values in the supplied workbook. The app therefore treats it as a date-of-birth/date-like field until the business meaning is confirmed.

## Production notes

- Add authentication before exposing the endpoint publicly.
- Add rate limiting and an upload-size limit at your hosting layer.
- Do not log raw images, phone numbers, names, or extracted records.
- Add a human review step for low-confidence handwriting before production use.
- Set an OpenAI project spend limit/alert.
