import { CampaignsShell } from "./shell";

/** Opening the page shows its real frame at once; only the rows and the count shimmer until Meta answers. */
export default function Loading() {
  return <CampaignsShell all={false} connected />;
}
