
import { FilamentDetails } from "../types";

export const getSheetData = async (spreadsheetId: string, sheetName: string, accessToken: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:K`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.values || [];
};

export const findFilamentRow = (data: any[][], details: FilamentDetails): number => {
  if (data.length < 2) return -1;
  // Based on 11-column mapping (B 'In Stock' removed):
  // C (Index 2): Brand
  // D (Index 3): Color Name
  // E (Index 4): Material Type
  const b = details.brand.toLowerCase();
  const c = details.color.toLowerCase();
  const m = details.materialType.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (
      row[2]?.toString().toLowerCase() === b &&
      row[3]?.toString().toLowerCase() === c &&
      row[4]?.toString().toLowerCase() === m
    ) {
      return i + 1; // 1-based index for Sheets API
    }
  }
  return -1;
};

export const syncFilament = async (
  spreadsheetId: string,
  sheetName: string,
  details: FilamentDetails,
  accessToken: string,
  rowIndex: number = -1
) => {
  const isUpdate = rowIndex > 0;
  const range = isUpdate ? `${sheetName}!A${rowIndex}:K${rowIndex}` : `${sheetName}!A1:K1`;
  const url = isUpdate 
    ? `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`
    : `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`;

  // Aligning with New Clean Headers (A-K):
  // A: Date | B: Qty | C: Brand | D: Color Name | E: Material Type | F: Specs | G: Size | H: Temp | I: Used Status | J: Barcode | K: Price
  const values = [
    [
      new Date().toISOString().split('T')[0], // A
      details.qtyInStock || 1, // B
      details.brand, // C
      details.color, // D
      details.materialType, // E
      details.diameter, // F
      details.weight, // G
      details.printTemp + (details.bedTemp !== 'Unknown' ? ' / ' + details.bedTemp : ''), // H
      details.usedStatus || 'Full', // I
      details.barcode, // J
      details.price || 'Unknown' // K
    ]
  ];

  const response = await fetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values })
  });

  if (!response.ok) throw new Error('Sync failed');
  return await response.json();
};
