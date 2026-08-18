import type { ReactNode } from 'react'

export default function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="ui-table-wrap"><table className="ui-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}
