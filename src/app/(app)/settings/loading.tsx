import { PageLoading } from "@/components/PageLoading";

export default function Loading() {
  return <PageLoading narrow title="הגדרות" lead="התקציב, המגבלות, וכל מה שמחובר למייקי." sections={["תקציב השיווק החודשי", "מגבלות", "חיבורים"]} />;
}
