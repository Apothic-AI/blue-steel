type RetryOptions = {
    retries?: number;
    delay?: number;
    maxDelay?: number;
    exponential?: boolean | number; // true = 2x, or custom multiplier
    throwOnExhaustion?: boolean;
    retryIf?: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
};

export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions & { throwOnExhaustion: false }
): Promise<T | null>;

export async function retry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions & { throwOnExhaustion?: true }
): Promise<T>;

export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T | null> {
    const {
        retries = 3,
        delay = 0,
        maxDelay = Infinity,
        exponential = false,
        throwOnExhaustion = true, // Now defaults to true
        retryIf = () => true,
        onRetry
    } = options;

    const multiplier = exponential === true ? 2 : exponential || 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (!(error instanceof Error)) {
                throw new Error(`Non-Error thrown: ${String(error)}`);
            }

            if (attempt === retries || !retryIf(error)) {
                if (throwOnExhaustion) {
                    throw error;
                }
                return null;
            }

            if (onRetry) {
                onRetry(error, attempt + 1);
            }

            if (delay > 0) {
                const currentDelay = Math.min(
                    delay * Math.pow(multiplier, attempt),
                    maxDelay
                );
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }
    }

    // Unreachable
    return null as any;
}

