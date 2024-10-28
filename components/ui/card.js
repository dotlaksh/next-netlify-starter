export function Card({ children }) {
  return <div className="shadow-lg rounded-lg p-4 bg-white">{children}</div>;
}

export function CardHeader({ children }) {
  return <div className="border-b pb-2 mb-2">{children}</div>;
}

export function CardTitle({ children }) {
  return <h2 className="text-xl font-semibold">{children}</h2>;
}

export function CardContent({ children }) {
  return <div>{children}</div>;
}
