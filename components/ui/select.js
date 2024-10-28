export function Select({ children, ...props }) {
  return <select {...props} className="border rounded px-3 py-2">{children}</select>;
}

export function SelectTrigger({ children, ...props }) {
  return <div {...props}>{children}</div>;
}

export function SelectContent({ children }) {
  return <div>{children}</div>;
}

export function SelectItem({ children, ...props }) {
  return <option {...props}>{children}</option>;
}

export function SelectValue({ children }) {
  return <span>{children}</span>;
}
