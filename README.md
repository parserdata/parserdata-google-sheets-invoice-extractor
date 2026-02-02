# Parserdata × Google Sheets: Invoice Extractor from Google Drive

![Google Sheets workflow](https://img.shields.io/badge/Google%20Sheets-workflow-blue)
![Parserdata API](https://img.shields.io/badge/Parserdata-API-green)

This example shows how to:

- Watch a **Google Drive folder** full of invoice PDFs,
- Send each new file to the **Parserdata** `/v1/extract` API,
- And write the results into a **Google Sheet** in a flattened format  
  (one row per line item, invoice fields repeated).

It is implemented as a **Google Apps Script** attached to a Google Sheet and triggered on a schedule (e.g. every 15 minutes).

> ⚠️ This repository is a reference example. Do **not** commit your real Parserdata API keys here. Configure them only in your private Apps Script project.

---

## What you get

The script:

- Looks at a specific **Drive folder**.
- Processes **only PDF files**.
- Remembers which files were already processed, so each invoice is handled only once.
- Extracts, for every invoice:
  - `invoice_number`
  - `invoice_date`
  - `supplier_name`
  - `total_amount`
  - `line_items` (table)
- Writes to a `Flattened` sheet where each row contains:
  - `file_name`
  - `invoice_number`
  - `invoice_date`
  - `supplier_name`
  - `total_amount`
  - `description`
  - `quantity`
  - `unit`
  - `unit_price`

If an invoice has multiple line items, you get multiple rows with the same invoice fields and different line-item fields.

---

## Prerequisites

- A **Parserdata** account and API key.
- A **Google Workspace** or Gmail account.
- A folder in **Google Drive** where you store invoice PDFs.
- Basic access to **Google Sheets** and **Apps Script**.

You do **not** need any servers or Node.js for this example. Everything runs inside Google's infrastructure.

---

## 1. Create the Google Sheet

1. Open [Google Sheets](https://sheets.google.com).
2. Click **Blank** to create a new sheet.
3. Give it a name, for example: `INV_Extractor`.
4. (Optional) Rename the default tab to something else or leave as is. The script will automatically create a new tab called `Flattened`.

---

## 2. Create the Drive folder for invoices

1. Open [Google Drive](https://drive.google.com).
2. Click **New → Folder**.
3. Name it, for example: `Invoices`.
4. Upload one or more **PDF invoices** into this folder.
5. Copy the **folder ID** from the URL:
   - The URL will look like:
     `https://drive.google.com/drive/folders/1AbCdEfgHiJkLmNoPqRsTuVwXyZ`
   - The part after `/folders/` is your `FOLDER_ID`:
     `1AbCdEfgHiJkLmNoPqRsTuVwXyZ`
You will need this ID when configuring the script.

---

## 3. Open Apps Script from the Sheet

1. Go back to the Google Sheet (`INV_Extractor`).
2. In the menu, click **Extensions → Apps Script**.
3. A new tab with the Apps Script editor will open.
   
---

## 4. Add the script

1. In the Apps Script editor, create a new file (or use the default `Code.gs`).
2. Copy the contents of [`Code.gs`](./Code.gs) from this repository and paste it into the editor.
3. At the top of the script, configure:
   ```
   const PARSERDATA_API_KEY = 'YOUR_PARSERDATA_API_KEY';
   const FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID';
   ```
Replace `YOUR_PARSERDATA_API_KEY` with your real Parserdata API key.

Replace `YOUR_GOOGLE_DRIVE_FOLDER_ID` with the ID you copied in step 2.

4. Click File → Save (or press Ctrl+S / Cmd+S).

Your API key and folder ID live only inside this Apps Script project. Do not commit them to GitHub.

## 5. How the script works

The main function is:

`function processNewInvoicesFlattened() { ... }`

When it runs, it:
1. Looks at all files in the folder with ID FOLDER_ID.
2. Filters to PDF files.
3. Skips any files it has processed before (using ScriptProperties to remember processed file IDs).
4. For each new PDF:
- Reads the file as a blob.
- Calls https://api.parserdata.com/v1/extract with:
  - file: the PDF blob;
  - schema: the configured invoice schema.
- Recursively searches the JSON for:
  - invoice_number
  - invoice_date
  - supplier_name
  - total_amount
  - line_items
- Writes one or more rows into a sheet named Flattened.

The Flattened sheet is created automatically if it doesn't exist, and the header row is added on first run.

## 6. Run it once manually

Before you can schedule the script, you must run it once to grant permissions.
1. In the Apps Script editor, make sure processNewInvoicesFlattened is selected in the function dropdown.
2. Click the Run ▶ button.
3. Apps Script will ask you to review permissions:
- Choose your account.
- Approve access to:
  - View / manage your spreadsheets
  - View / manage files in the selected Drive folder
  - Connect to an external service (Parserdata API).
4. After the run finishes go back to your Google Sheet.
A new tab called Flattened should exist.

If your folder already contains invoices, the sheet should now have one or more rows with data.

If you see errors, open View → Logs in the Apps Script editor and check for details (HTTP status codes, API error messages, etc.).

## 7. Set up an automatic trigger (process new invoices on a schedule)

There is no built-in "on file added to folder" trigger in Google Apps Script, but you can simulate it with a time-based trigger.
1. In the Apps Script editor, click the Triggers icon (clock) in the left sidebar.
2. Click + Add Trigger in the bottom right.
3. Configure:
- Choose which function to run: processNewInvoicesFlattened
- Deployment: Head
- Event source: Time-driven
- Type of time based trigger: e.g. Every 15 minutes (or hourly).
4. Click Save.
From now on:
- Whenever a new PDF invoice is added to the configured Drive folder,
- It will be picked up on the next trigger run,
- Parsed by Parserdata API,
- And appended as new rows in the Flattened sheet.

Previously processed files won't be touched again.

## 8. Customising the schema and output

You can modify the `INVOICE_SCHEMA` object at the top of Code.gs:

```
const INVOICE_SCHEMA = {
  invoice_number: "string",
  invoice_date:  "date",
  supplier_name: "string",
  total_amount:  "number",
  line_items:    "table"
};
```

For example, if you want to extract currency or vat_number, add them here and then map them into the output rows.

You can change the columns in the sheet

The header row is defined in processNewInvoicesFlattened:

```
sheet.appendRow([
  'file_name',
  'invoice_number',
  'invoice_date',
  'supplier_name',
  'total_amount',
  'description',
  'quantity',
  'unit',
  'unit_price'
]);
```

And each row is appended like this:

```
rows.push([
  fileName,
  invoiceNumber,
  invoiceDate,
  supplierName,
  totalAmount,
  item.description  ?? '',
  item.quantity     ?? '',
  item.unit         ?? '',
  item.unit_price   ?? ''
]);
```

Adjust both the header and the row structure if you want additional columns or a different layout.

## 9. Security notes

Keep your Parserdata API key secret. Do not commit it to GitHub.

In this example, the key is stored inside a private Apps Script project, which is fine for personal or team use.

If you want to share the sheet with other people, consider moving the key into Script Properties and referencing it there, instead of hard-coding it.

## 10. Troubleshooting

1. Sheet stays empty
Check that the Drive folder contains PDF files.
Run the script manually and check `View → Logs` for API errors.

2. Rows appear, but some columns are blank
The keys in the Parserdata response might differ from the ones used here.
Use `Logger.log(raw)` inside `callParserdataWithFile_` to inspect the exact JSON and adjust field names where needed.

3. "Authorization required" or permission errors
Run processNewInvoicesFlattened manually again and re-approve the script permissions.

## 11. License

MIT
