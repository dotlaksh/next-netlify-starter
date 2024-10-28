export function Button({ children, onClick, variant = "primary", ...props }) {
  const baseStyle = "px-4 py-2 rounded font-semibold focus:outline-none";
  const variants = {
    primary: `${baseStyle} bg-blue-600 text-white hover:bg-blue-700`,
    outline: `${baseStyle} border border-gray-400 text-gray-600 hover:bg-gray-100`,
  };
  return (
    <button onClick={onClick} className={variants[variant]} {...props}>
      {children}
    </button>
  );
}
