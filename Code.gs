// === CONFIGURE THIS PART ===
const PARSERDATA_API_KEY = 'pd_live_XXXXXXXX';   // <-- put your Parserdata API key here
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE';        // <-- Google Drive folder with invoice PDFs

// Parserdata invoice schema
const INVOICE_SCHEMA = {
  invoice_number: "string",
  invoice_date: "date",
  supplier_name: "string",
  total_amount: "number",
  line_items: "table"
};

/**
 * Main entry: processes ONLY NEW PDF files in the Drive folder
 * and appends data into a single "Flattened" sheet
 * (one row per line item, invoice fields repeated).
 */

function processNewInvoicesFlattened() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  const ss = SpreadsheetApp.getActive();
  const sheet = getOrCreateSheet_(ss, 'Flattened');

  // Create header once
  if (sheet.getLastRow() === 0) {
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
  }

  const processedIds = loadProcessedIds_(); // { fileId: true, ... }
  const newIds = [];
  const rows = [];
  let processedCount = 0;

  while (files.hasNext()) {
    const file = files.next();
    const fileId = file.getId();

    // Only PDFs, and skip already processed files
    if (file.getMimeType() !== MimeType.PDF) continue;
    if (processedIds[fileId]) continue;

    const raw = callParserdataWithFile_(file);
    if (!raw) continue; // error already logged

    // Deep-search important fields anywhere in the JSON
    const fileNameFromApi =
      findKeyDeep_(raw, 'fileName') ||
      findKeyDeep_(raw, 'file_name');

    const fileName = fileNameFromApi || file.getName();

    const invoiceNumber = findKeyDeep_(raw, 'invoice_number') || '';
    const invoiceDate   = findKeyDeep_(raw, 'invoice_date')   || '';
    const supplierName  = findKeyDeep_(raw, 'supplier_name')  || '';
    const totalAmount   = findKeyDeep_(raw, 'total_amount')   || '';

    const lineItems = findKeyDeep_(raw, 'line_items') || [];

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      // still write one row with just invoice-level data
      rows.push([
        fileName,
        invoiceNumber,
        invoiceDate,
        supplierName,
        totalAmount,
        '',
        '',
        '',
        ''
      ]);
    } else {
      lineItems.forEach(item => {
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
      });
    }

    newIds.push(fileId);
    processedCount++;
    Utilities.sleep(500); // small pause if many files
  }

  if (rows.length > 0) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  }

  if (newIds.length > 0) {
    saveProcessedIds_(processedIds, newIds);
  }

  SpreadsheetApp.getActive().toast(
    'Processed ' + processedCount + ' new PDF file(s) into Flattened sheet.'
  );
}

/**
 * Calls Parserdata /v1/extract sending the actual PDF file.
 * Returns the raw parsed JSON (whatever shape it has).
 */

function callParserdataWithFile_(file) {
  const apiUrl = 'https://api.parserdata.com/v1/extract';

  const blob = file.getBlob(); // correct MIME type (application/pdf)

  const formData = {
    file: blob,
    schema: JSON.stringify(INVOICE_SCHEMA)
  };

  const options = {
    method: 'post',
    payload: formData,
    headers: {
      'X-API-Key': PARSERDATA_API_KEY
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const status = response.getResponseCode();
  const bodyText = response.getContentText();

  Logger.log('Status for "%s": %s', file.getName(), status);

  if (status !== 200) {
    console.error(
      'Parserdata API error for file ' + file.getName() + ': ' +
      status + ' - ' + bodyText
    );
    return null;
  }

  try {
    const raw = JSON.parse(bodyText);
    Logger.log(
      'Top-level keys for "%s": %s',
      file.getName(),
      Object.keys(raw || {}).join(', ')
    );
    return raw;
  } catch (e) {
    console.error('Failed to parse JSON for file ' + file.getName() + ': ' + e);
    return null;
  }
}

/**
 * Recursively search an object/array for a key and return its value.
 * Returns the first match found (depth-first).
 */

function findKeyDeep_(obj, targetKey) {
  if (obj === null || obj === undefined) return null;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const res = findKeyDeep_(obj[i], targetKey);
      if (res !== null && res !== undefined) return res;
    }
    return null;
  }

  if (typeof obj === 'object') {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      if (key === targetKey) {
        return obj[key];
      }
      const res = findKeyDeep_(obj[key], targetKey);
      if (res !== null && res !== undefined) return res;
    }
  }

  return null;
}

/**
 * Store / load processed file IDs in ScriptProperties
 * so we don’t process the same PDF twice.
 */

function loadProcessedIds_() {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty('processedFileIds');
  if (!json) return {};
  try {
    return JSON.parse(json); // { fileId: true, ... }
  } catch (e) {
    Logger.log('Failed to parse processedFileIds, resetting: ' + e);
    return {};
  }
}

function saveProcessedIds_(current, newIds) {
  newIds.forEach(id => {
    current[id] = true;
  });
  PropertiesService.getScriptProperties().setProperty(
    'processedFileIds',
    JSON.stringify(current)
  );
}

/**
 * Utility: get sheet by name or create it if missing.
 */

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}
