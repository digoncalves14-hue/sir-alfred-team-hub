export const Avatar = ({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" | "xl" }) => {
  const sizes = { sm: "h-9 w-9 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-lg", xl: "h-24 w-24 text-2xl" };
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-bold border-2 border-gold shrink-0`}
      style={{ background: "#FFF8DC", color: "#7A5C00" }}
    >
      {initials}
    </div>
  );
};
