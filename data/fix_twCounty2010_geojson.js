const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'twCounty2010.geo.json');
const outputPath = path.join(__dirname, 'twCounty2010.fixed.geo.json');

const geojson = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let fixedCount = 0;
let warnCount = 0;

function fixLinearRing(ring) {
  // 檢查首尾是否相同，不同則補上
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
      fixedCount++;
    }
  }
  // 如果點數不足4，複製最後一點直到滿4點
  while (ring.length < 4) {
    ring.push([...ring[ring.length - 1]]);
    fixedCount++;
  }
  return ring;
}

geojson.features.forEach((feature, idx) => {
  const name = feature.properties?.COUNTYNAME || `index:${idx}`;
  let changed = false;

  if (feature.geometry.type === 'Polygon') {
    feature.geometry.coordinates = feature.geometry.coordinates.map((ring, i) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        warnCount++;
        console.warn(`[警告] ${name} 的第${i}個 LinearRing 點數不足4，已自動修正`);
        changed = true;
      }
      return fixLinearRing(ring);
    });
  } else if (feature.geometry.type === 'MultiPolygon') {
    feature.geometry.coordinates = feature.geometry.coordinates.map((poly, pi) =>
      poly.map((ring, ri) => {
        if (!Array.isArray(ring) || ring.length < 4) {
          warnCount++;
          console.warn(`[警告] ${name} 的第${pi}個多邊形第${ri}個 LinearRing 點數不足4，已自動修正`);
          changed = true;
        }
        return fixLinearRing(ring);
      })
    );
  }
  if (changed) {
    console.log(`[修正] ${name} 已修正格式`);
  }
});

geojson.features.forEach((feature, idx) => {
  const name = feature.properties?.COUNTYNAME || `index:${idx}`;
  let rings = [];
  if (feature.geometry.type === 'Polygon') {
    rings = feature.geometry.coordinates;
  } else if (feature.geometry.type === 'MultiPolygon') {
    rings = feature.geometry.coordinates.flat();
  }
  const validRings = rings.filter(ring => Array.isArray(ring) && ring.length >= 4);
  if (validRings.length === 0) {
    console.warn(`[嚴重警告] ${name} 沒有任何合法的 LinearRing，請檢查原始資料！`);
  }
});

fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2), 'utf8');
console.log(`\n修正完成！共修正 ${fixedCount} 處，警告 ${warnCount} 處。`);
console.log(`修正後檔案已輸出至: ${outputPath}`);
