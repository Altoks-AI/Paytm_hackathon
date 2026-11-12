import { Input, Label, Select } from "@/components/ui";

export type CompanyValues = { name?: string | null; industry?: string | null; size?: string | null; location?: string | null; contactEmail?: string | null; contactPhone?: string | null; website?: string | null };

const sizes = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

/** Shared company detail inputs for onboarding and settings. */
export function CompanyFields({ v = {} }: { v?: CompanyValues }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Company name</Label>
        <Input name="name" required defaultValue={v.name ?? ""} placeholder="Acme Dental Clinic" />
      </div>
      <div>
        <Label>Industry</Label>
        <Input name="industry" defaultValue={v.industry ?? ""} placeholder="Healthcare, Retail, Real estate…" />
      </div>
      <div>
        <Label>Company size</Label>
        <Select name="size" defaultValue={v.size ?? ""}>
          <option value="">Select…</option>
          {sizes.map((s) => <option key={s} value={s}>{s} employees</option>)}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>Location</Label>
        <Input name="location" defaultValue={v.location ?? ""} placeholder="City, Country" />
      </div>
      <div>
        <Label>Contact email</Label>
        <Input name="contactEmail" type="email" defaultValue={v.contactEmail ?? ""} placeholder="support@acme.com" />
      </div>
      <div>
        <Label>Contact phone</Label>
        <Input name="contactPhone" type="tel" defaultValue={v.contactPhone ?? ""} placeholder="+91 98765 43210" />
      </div>
      <div className="sm:col-span-2">
        <Label hint="we read it to brief your AI agent">Website URL</Label>
        <Input name="website" defaultValue={v.website ?? ""} placeholder="https://acme.com" />
      </div>
    </div>
  );
}

/** Parse the CompanyFields inputs from a form submission. */
export function readCompanyForm(f: FormData) {
  const s = (k: string) => String(f.get(k) ?? "").trim() || null;
  return { name: s("name") ?? "", industry: s("industry"), size: s("size"), location: s("location"), contactEmail: s("contactEmail"), contactPhone: s("contactPhone"), website: s("website") };
}
