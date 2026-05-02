export const Logo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const titleSize = { sm: "text-xl", md: "text-3xl", lg: "text-5xl" }[size];
  const subSize = { sm: "text-[10px]", md: "text-xs", lg: "text-sm" }[size];
  return (
    <div className="text-center">
      <h1 className={`${titleSize} font-black tracking-[0.25em] text-white`}>SIR ALFRED</h1>
      <p className={`${subSize} font-semibold tracking-[0.4em] text-gold mt-1`}>GESTÃO DE EQUIPE</p>
    </div>
  );
};
