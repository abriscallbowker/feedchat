import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "fc-button-primary" : "fc-button-secondary";
  const classes = `fc-button ${variantClass} ${className}`.trim();

  return (
    <button {...props} className={classes}>
      {children}
    </button>
  );
}
