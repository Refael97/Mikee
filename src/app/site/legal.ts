/**
 * The operator's details, shown on the terms, privacy and accessibility pages. A field left empty is simply
 * not shown; fill in the company number and address here before launch. Email and phone default to the
 * SUPPORT_EMAIL and SUPPORT_WHATSAPP variables.
 */
export const LEGAL = {
  company: "ADRT GROUP LTD",
  companyHe: "אדרט גרופ בע״מ",
  companyNumber: "",
  address: "",
  // The support details the app already shows in its help panel (Railway variables), unless set here.
  email: process.env.SUPPORT_EMAIL ?? "",
  phone: process.env.SUPPORT_WHATSAPP ?? "",
  /** The privacy and accessibility contact (and coordinator) required by Israeli regulations. */
  contactName: "רפאל לוי",
  updated: "16 באוקטובר 2026",
};
