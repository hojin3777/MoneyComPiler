import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * 1. 템플릿 다운로드 함수
 * @param headers 엑셀 파일의 헤더로 사용할 문자열 배열
 * @param filename 다운로드될 파일 이름
 */
export const downloadTemplate = async (headers: string[], filename: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template');

  // 헤더 행 추가
  worksheet.addRow(headers);

  // 버퍼로 파일 생성 후 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};

/**
 * 2. 데이터 내보내기 함수
 * @param data 엑셀로 변환할 객체 배열
 * @param headers { 데이터_키: '엑셀_헤더_이름' } 형식의 객체
 * @param filename 다운로드될 파일 이름
 */
export const exportDataToExcel = async (data: any[], headers: { [key: string]: string }, filename: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transactions');

  // 헤더와 키를 기반으로 컬럼 설정
  worksheet.columns = Object.keys(headers).map(key => ({
    header: headers[key],
    key: key,
    width: 20 // 기본 너비 설정
  }));

  // 데이터 행 추가
  worksheet.addRows(data);

  // 버퍼로 파일 생성 후 다운로드
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
};

/**
 * 3. 데이터 불러오기 함수
 * @param file 사용자가 업로드한 엑셀 파일
 * @returns 엑셀 데이터를 파싱한 객체 배열 Promise
 */
export const importDataFromExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer) {
          throw new Error("파일을 읽을 수 없습니다.");
        }
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as ArrayBuffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new Error("시트가 존재하지 않습니다.");
        }

        const jsonData: any[] = [];
        const headerRow = worksheet.getRow(1);
        if (!headerRow.values || headerRow.values.length === 1) { // exceljs는 빈 배열 대신 [null]을 반환할 수 있음
          throw new Error("헤더를 찾을 수 없습니다.");
        }
        
        // 헤더 값을 문자열 배열로 변환 (ExcelJS는 배열 인덱스가 1부터 시작)
        const headers = (headerRow.values as string[]).slice(1);

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) { // 헤더 행 건너뛰기
            const rowData: { [key: string]: any } = {};
            const rowValues = row.values as any[];
            headers.forEach((header, index) => {
              const cellValue = rowValues[index + 1];

              // 셀 값 처리 로직 보강
              if (cellValue && typeof cellValue === 'object') {
                // 1. 서식 있는 텍스트(Rich Text) 객체 처리
                if ('richText' in cellValue && Array.isArray(cellValue.richText)) {
                  rowData[header] = cellValue.richText.map((rt: { text: string }) => rt.text).join('');
                } 
                // 2. 수식(Formula) 결과 값 처리
                else if ('result' in cellValue) {
                  rowData[header] = cellValue.result;
                }
                // 3. 기타 객체는 텍스트로 변환 시도
                else {
                  rowData[header] = String(cellValue);
                }
              } else {
                // 일반적인 값(문자열, 숫자, null 등) 처리
                rowData[header] = cellValue;
              }
            });
            jsonData.push(rowData);
          }
        });
        resolve(jsonData);

      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};