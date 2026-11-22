import { getCurrentSemester } from "./semesterFee";
import { supabase } from "./supabase";

export type SemesterFeeSummary = {
  amountPaid: number;
  pendingReview: boolean;
};

export async function getSellerSemesterFeeSummary(
  sellerId: string,
  semester = getCurrentSemester(),
): Promise<SemesterFeeSummary> {
  const { data, error } = await supabase
    .from("seller_semester_payments")
    .select("amount, status")
    .eq("seller_id", sellerId)
    .eq("semester", semester);

  if (error) throw error;

  const amountPaid = Math.min(
    50,
    (data || [])
      .filter((payment) => payment.status === "approved")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  return {
    amountPaid,
    pendingReview: (data || []).some((payment) => payment.status === "pending"),
  };
}
