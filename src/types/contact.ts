export type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};
export type Contact = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: Address;
  createdAt: Date;
};
