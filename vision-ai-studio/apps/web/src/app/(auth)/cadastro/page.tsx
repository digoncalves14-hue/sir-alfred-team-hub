import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/session";

export const metadata = { title: "Criar conta" };

export default async function Page() {
  if (await getSession()) redirect("/");
  return <AuthForm mode="register" />;
}
