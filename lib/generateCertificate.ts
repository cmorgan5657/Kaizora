import jsPDF from "jspdf";

export async function generateLicenseCertificate(licenseData: {
  license_number: string;
  asset_title: string;
  asset_type: string;
  license_type_name: string;
  license_type_description: string;
  buyer_email: string;
  purchase_date: string;
  purchase_price: number;
  allows_commercial_use: boolean;
  can_modify: boolean;
  can_resell: boolean;
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Simple border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(15, 15, pageWidth - 30, 267);

  // Title
  doc.setFontSize(24);
  doc.setFont("helvetica", "normal");
  doc.text("License Certificate", pageWidth / 2, 35, { align: "center" });

  // License Number
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(licenseData.license_number, pageWidth / 2, 45, { align: "center" });

  // Divider
  doc.setLineWidth(0.2);
  doc.line(30, 55, pageWidth - 30, 55);

  // Content
  let y = 70;
  const leftMargin = 30;
  const lineHeight = 8;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Asset
  doc.setFont("helvetica", "bold");
  doc.text("Asset", leftMargin, y);
  doc.setFont("helvetica", "normal");
  doc.text(licenseData.asset_title, leftMargin, y + lineHeight);
  y += lineHeight * 2 + 5;

  // License Type
  doc.setFont("helvetica", "bold");
  doc.text("License Type", leftMargin, y);
  doc.setFont("helvetica", "normal");
  doc.text(licenseData.license_type_name, leftMargin, y + lineHeight);
  y += lineHeight * 2 + 5;

  // Buyer
  doc.setFont("helvetica", "bold");
  doc.text("Licensed To", leftMargin, y);
  doc.setFont("helvetica", "normal");
  doc.text(licenseData.buyer_email, leftMargin, y + lineHeight);
  y += lineHeight * 2 + 5;

  // Purchase Date
  doc.setFont("helvetica", "bold");
  doc.text("Purchase Date", leftMargin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    new Date(licenseData.purchase_date).toLocaleDateString(),
    leftMargin,
    y + lineHeight,
  );
  y += lineHeight * 2 + 5;

  // Purchase Price
  doc.setFont("helvetica", "bold");
  doc.text("Purchase Price", leftMargin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `$${(licenseData.purchase_price / 100).toFixed(2)} USD`,
    leftMargin,
    y + lineHeight,
  );
  y += lineHeight * 2 + 10;

  // Permissions
  doc.setFont("helvetica", "bold");
  doc.text("Permitted Use", leftMargin, y);
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (licenseData.allows_commercial_use) {
    doc.text("• Commercial use allowed", leftMargin + 5, y);
    y += 6;
  }

  if (licenseData.can_modify) {
    doc.text("• Modification allowed", leftMargin + 5, y);
    y += 6;
  }

  if (licenseData.can_resell) {
    doc.text("• Resale allowed", leftMargin + 5, y);
    y += 6;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("KAIZORA", pageWidth / 2, 275, { align: "center" });
  doc.text(`Generated ${new Date().toLocaleDateString()}`, pageWidth / 2, 280, {
    align: "center",
  });

  return doc;
}
