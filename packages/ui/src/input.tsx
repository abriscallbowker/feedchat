import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  const classes = `fc-input ${className}`.trim();
  return <input {...props} className={classes} />;
}
