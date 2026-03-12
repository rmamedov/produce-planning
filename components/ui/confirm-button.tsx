"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

export function ConfirmButton({
  confirmText = "Ви впевнені?",
  onConfirm,
  ...props
}: ButtonProps & {
  confirmText?: string;
  onConfirm: () => void;
}) {
  return (
    <Button
      {...props}
      onClick={() => {
        if (window.confirm(confirmText)) {
          onConfirm();
        }
      }}
    />
  );
}
