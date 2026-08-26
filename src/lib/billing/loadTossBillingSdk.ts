type TossBillingRequest = {
  method: "CARD";
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
};

type TossPaymentInstance = {
  requestBillingAuth: (request: TossBillingRequest) => Promise<void>;
};

type TossPaymentsInstance = {
  payment: (options: { customerKey: string }) => TossPaymentInstance;
};

type TossPaymentsFactory = (clientKey: string) => TossPaymentsInstance;

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

const SDK_URL = "https://js.tosspayments.com/v2/standard";
let sdkPromise: Promise<TossPaymentsFactory> | null = null;

export function loadTossBillingSdk(): Promise<TossPaymentsFactory> {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<TossPaymentsFactory>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing || document.createElement("script");
    const handleLoad = () => window.TossPayments
      ? resolve(window.TossPayments)
      : reject(new Error("toss-sdk-unavailable"));
    const handleError = () => reject(new Error("toss-sdk-load-failed"));
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export async function openTossBillingWindow({
  clientKey,
  customerKey,
  successUrl,
  failUrl,
  customerEmail,
  customerName,
}: {
  clientKey: string;
  customerKey: string;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
}) {
  const TossPayments = await loadTossBillingSdk();
  const payment = TossPayments(clientKey).payment({ customerKey });
  await payment.requestBillingAuth({
    method: "CARD",
    successUrl,
    failUrl,
    ...(customerEmail ? { customerEmail } : {}),
    ...(customerName ? { customerName } : {}),
  });
}
