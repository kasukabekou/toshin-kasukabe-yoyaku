"use client";
import { useEffect, useState } from "react";
import { Select } from "@/components/ui/primitives";

interface Member {
  id: string;
  name: string;
}

let cache: Member[] | null = null;

// 担当者プルダウン。共有パスワードで入った後、記入者・担当を選ぶために使う。
export function StaffSelect({
  value,
  onChange,
  placeholder = "未設定",
  ...props
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const [members, setMembers] = useState<Member[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    fetch("/api/staff/members")
      .then((r) => r.json())
      .then((j) => {
        cache = j.members ?? [];
        setMembers(cache!);
      })
      .catch(() => {});
  }, []);

  return (
    <Select {...props} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}
