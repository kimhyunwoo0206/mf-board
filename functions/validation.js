'use strict';
const catalog = require('./catalog.json');
function validateImage(image) {
  if (typeof image !== 'string' || image.length > 7_000_000 ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new Error('JPG, PNG, WEBP 사진 한 장(5MB 이하)을 선택하세요.');
  }
  const encoded = image.split(',')[1];
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 5_000_000 || bytes.toString('base64') !== encoded) {
    throw new Error('사진 파일을 다시 선택하세요.');
  }
  return image;
}
function validateExtraction(value) {
  if (!value || !Array.isArray(value.rows) || value.rows.length > 300 ||
      !Array.isArray(value.warnings)) throw new Error('판독 형식 오류');
  const warnings = value.warnings.map(String);
  const items = new Map();
  value.rows.forEach((row, index) => {
    const item = row.barcode ? catalog.find(x => x.barcode === row.barcode) :
      catalog.find(x => x.name === row.name);
    if (!item || row.uncertain || !Number.isSafeInteger(row.quantity) || row.quantity < 0 || row.quantity > 100000) {
      warnings.push(`${index + 1}행: 품목 또는 수량 확인 필요 (${String(row.name).slice(0,100)})`);
      return;
    }
    if (row.quantity) items.set(item.name, (items.get(item.name) || 0) + row.quantity);
  });
  const rows = Array.from(items, ([name, quantity]) => ({name, quantity}));
  const total = rows.reduce((n,row) => n + row.quantity, 0);
  if (!rows.length) warnings.push('읽을 수 있는 품목이 없습니다.');
  if (value.total !== null && (!Number.isSafeInteger(value.total) || value.total !== total))
    warnings.push(`사진 총합과 판독 합계가 다릅니다: 사진 ${value.total}, 판독 ${total}`);
  return {rows, total, sourceTotal:value.total, warnings, needsReview:warnings.length > 0};
}
module.exports = {catalog, validateImage, validateExtraction};
