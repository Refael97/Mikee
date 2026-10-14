/** A placeholder in the shape of a value that is still loading (shimmer; see .skeleton in globals.css). */
export function Sk({ w = "4rem", h = "0.9em", className = "" }: { w?: string; h?: string; className?: string }) {
  return <span aria-hidden className={`skeleton align-middle ${className}`} style={{ width: w, height: h }} />;
}
