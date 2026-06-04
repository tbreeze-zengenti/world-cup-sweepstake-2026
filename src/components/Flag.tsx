/** SVG flag via the flag-icons stylesheet (supports gb-eng / gb-sct). */
export function Flag({ iso2 }: { iso2: string }) {
  return <span className={`fi fi-${iso2} flag`} aria-hidden="true" />
}
