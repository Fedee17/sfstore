import * as XLSX from "xlsx";
import * as codepages from "xlsx/dist/cpexcel";

// Preserve non-Unicode legacy XLS encodings when Next/Node selects ESM.
XLSX.set_cptable(codepages);

/** Preserve the existing raw-number contract, including Excel date serials.
 * SheetJS 0.20.3 converts formatted numeric dates to Date in sheet_to_json
 * even with raw:true and cellDates:false. Clone only those cells so the source
 * workbook retains its number formats and cached text.
 */
export function readRawWorksheetRows<T>(
  worksheet: XLSX.WorkSheet | undefined,
  options: XLSX.Sheet2JSONOpts = {},
): T[] {
  if (!worksheet) return [];
  const rawCell = (cell: XLSX.CellObject) =>
    cell?.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)
      ? { ...cell, z: undefined }
      : cell;
  const sheet = { ...worksheet };
  for (const [address, cell] of Object.entries(worksheet)) {
    if (!address.startsWith("!")) sheet[address] = rawCell(cell);
  }
  if (worksheet["!data"]) {
    sheet["!data"] = worksheet["!data"].map((row: XLSX.CellObject[]) => row?.map(rawCell));
  }
  return XLSX.utils.sheet_to_json<T>(sheet, { ...options, raw: true });
}
