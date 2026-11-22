export function getCurrentSemester(): string {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  return month >= 8
    ? `1st Sem AY ${year}-${year + 1}`
    : `2nd Sem AY ${year - 1}-${year}`;
}

export function getSemesterPaymentStatus(paid: number): "unpaid" | "partial" | "paid" {
  if (paid >= 50) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}
