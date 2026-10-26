import { zipSync, strToU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../packages/core/test/fixtures');
mkdirSync(outDir, { recursive: true });

const OFD_XML_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocType="OFD" Version="1.1">`;

function ofdXml(docRoot = 'Doc_0/Document.xml') {
  return `${OFD_XML_HEAD}
  <ofd:DocBody>
    <ofd:DocInfo><ofd:DocID>fixture</ofd:DocID><ofd:Creator>ofdh5</ofd:Creator></ofd:DocInfo>
    <ofd:DocRoot>${docRoot}</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`;
}

function documentXml(pageCount, width = 210, height = 297) {
  const pages = Array.from({ length: pageCount }, (_, i) =>
    `    <ofd:Page ID="${i + 1}" BaseLoc="Pages/Page_${i}/Content.xml"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 ${width} ${height}</ofd:PhysicalBox></ofd:PageArea>
  </ofd:CommonData>
  <ofd:Pages>
${pages}
  </ofd:Pages>
</ofd:Document>`;
}

function textPage(text, { width = 210, height = 297, size = 5 } = {}) {
  const deltaX = Array.from(text).map(() => size.toFixed(2)).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 ${width} ${height}</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:TextObject ID="2" Boundary="20 30 170 10" Font="9" Size="${size}" CTM="1 0 0 1 0 0" Fill="true" Stroke="false">
      <ofd:FillColor Value="0 0 0"/>
      <ofd:TextCode X="0" Y="${size}" DeltaX="${deltaX}">${text}</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`;
}

function write(name, files) {
  const entries = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  writeFileSync(resolve(outDir, name), zipSync(entries));
  console.log('fixture:', name);
}

// 1. 单页纯文本
write('single-text.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': documentXml(1),
  'Doc_0/Pages/Page_0/Content.xml': textPage('ofdh5 单页文本测试'),
});

// 2. 12 页图文混排
{
  const files = { 'OFD.xml': ofdXml(), 'Doc_0/Document.xml': documentXml(12) };
  for (let i = 0; i < 12; i++) {
    files[`Doc_0/Pages/Page_${i}/Content.xml`] = textPage(`第 ${i + 1} 页`);
  }
  write('multi-page.ofd', files);
}

// 3. 矢量表格
write('vector-form.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': documentXml(1),
  'Doc_0/Pages/Page_0/Content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:PathObject ID="2" Boundary="20 20 170 60" LineWidth="0.5" Stroke="true" Fill="false">
      <ofd:AbbreviatedData>M 0 0 L 170 0 L 170 60 L 0 60 C</ofd:AbbreviatedData>
      <ofd:StrokeColor Value="0 0 0"/>
    </ofd:PathObject>
    <ofd:PathObject ID="3" Boundary="20 50 170 0.5" LineWidth="0.5" Stroke="true" Fill="false">
      <ofd:AbbreviatedData>M 0 0 L 170 0</ofd:AbbreviatedData>
      <ofd:StrokeColor Value="0 0 0"/>
    </ofd:PathObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`,
});

// 4. 损坏包：缺 Document.xml
write('broken.ofd', {
  'OFD.xml': ofdXml('Doc_0/Document.xml'),
  'Doc_0/Pages/Page_0/Content.xml': textPage('x'),
});

// 5. 图像资源 + 路径对象
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

write('image.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': documentXml(1),
  'Doc_0/Pages/Page_0/Res/image_0.png': PNG_1X1,
  'Doc_0/Pages/Page_0/Content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:ImageObject ID="4" Boundary="10 10 50 50" ResourceID="5" CTM="1 0 0 1 0 0"/>
    <ofd:PathObject ID="3" Boundary="20 80 100 40" LineWidth="1" Stroke="true" Fill="true" FillRule="evenodd">
      <ofd:AbbreviatedData>M 0 0 L 100 0 L 100 40 L 0 40 C</ofd:AbbreviatedData>
      <ofd:StrokeColor Value="0 0 255"/>
      <ofd:FillColor Value="200 200 200"/>
    </ofd:PathObject>
  </ofd:Layer></ofd:Content>
  <ofd:Resources>
    <ofd:MultiMedias>
      <ofd:MultiMedia ID="5" Type="Image">
        <ofd:MediaFile>Res/image_0.png</ofd:MediaFile>
      </ofd:MultiMedia>
    </ofd:MultiMedias>
  </ofd:Resources>
</ofd:Page>`,
});

// 6. 文档级 PublicRes（BaseLoc 指向独立 Res.xml）+ 页面 Use：字体 / 图片 / ColorSpace / DrawParam
write('publicres.ofd', {
  'OFD.xml': ofdXml(),
  'Doc_0/Document.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea>
    <ofd:PublicRes BaseLoc="Res.xml"/>
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
  </ofd:Pages>
</ofd:Document>`,
  'Doc_0/Res.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Fonts>
    <ofd:Font ID="9" FontName="SimSun" FamilyName="宋体"><ofd:FontFile>Res/Font_9.ttf</ofd:FontFile></ofd:Font>
  </ofd:Fonts>
  <ofd:MultiMedias>
    <ofd:MultiMedia ID="50" Type="Image"><ofd:MediaFile>Res/logo.png</ofd:MediaFile></ofd:MultiMedia>
  </ofd:MultiMedias>
  <ofd:ColorSpaces>
    <ofd:ColorSpace ID="10" Type="RGB" BitsPerComponent="8"/>
  </ofd:ColorSpaces>
  <ofd:DrawParams>
    <ofd:DrawParam ID="20" LineWidth="0.8">
      <ofd:StrokeColor Value="0 0 255" ColorSpace="10"/>
      <ofd:FillColor Value="0 255 0" ColorSpace="10"/>
    </ofd:DrawParam>
  </ofd:DrawParams>
</ofd:Res>`,
  'Doc_0/Res/logo.png': PNG_1X1,
  'Doc_0/Pages/Page_0/Content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:PathObject ID="2" Boundary="20 20 100 40" DrawParam="20" Stroke="true" Fill="true">
      <ofd:AbbreviatedData>M 0 0 L 100 0 L 100 40 L 0 40 C</ofd:AbbreviatedData>
      <ofd:FillColor ColorSpace="10" Value="255 0 0"/>
    </ofd:PathObject>
    <ofd:ImageObject ID="3" Boundary="10 200 20 20" ResourceID="50"/>
    <ofd:TextObject ID="4" Boundary="20 100 100 10" Font="9" Size="5" Fill="true" Stroke="false">
      <ofd:FillColor Value="0 0 0"/>
      <ofd:TextCode X="0" Y="5" DeltaX="5 5 5">发票</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`,
});

console.log('fixtures written to', outDir);
