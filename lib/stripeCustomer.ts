import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

type StripeLike = {
  customers: {
    create: (params: Stripe.CustomerCreateParams) => Promise<Stripe.Customer>;
    retrieve: (id: string) => Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  };
};

function isMissingCustomerError(error: unknown) {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

export async function getOrCreateStripeCustomerId(
  stripeClient: StripeLike,
  userId: string,
  email: string,
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  const existingCustomerId = profile?.stripe_customer_id?.trim();

  if (existingCustomerId) {
    try {
      const customer = await stripeClient.customers.retrieve(existingCustomerId);
      if (!("deleted" in customer && customer.deleted)) {
        return existingCustomerId;
      }
    } catch (error) {
      if (!isMissingCustomerError(error)) {
        throw error;
      }
    }
  }

  const customer = await stripeClient.customers.create({
    email,
    metadata: { user_id: userId },
  });

  await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

