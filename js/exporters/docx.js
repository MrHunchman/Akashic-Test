import { getStatusLabel } from "../utils.js";

export async function buildDOCX(data, type) {
  const docx = await import("https://cdn.jsdelivr.net/npm/docx@9.1.1/+esm");
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    WidthType
  } = docx;

  const rows = [
    new TableRow({
      children: ["Title", "Score", "Status", "Progress", "MAL ID"].map((text) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
        })
      )
    })
  ];

  for (const item of data) {
    rows.push(
      new TableRow({
        children: [
          item.title || "",
          String(item.score ?? ""),
          getStatusLabel(item.malStatus),
          String(item.progress ?? ""),
          String(item.idMal || "")
        ].map((text) =>
          new TableCell({
            children: [new Paragraph(String(text))]
          })
        )
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Akashic Export",
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph(`Media Type: ${type}`),
          new Paragraph(`Total Entries: ${data.length}`),
          new Paragraph(""),
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE
            },
            rows
          })
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
}
