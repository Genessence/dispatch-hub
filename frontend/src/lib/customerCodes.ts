/**
 * Customer Code Mapping for MSIL Plants
 * Maps customer names to their corresponding customer codes
 */

export const CUSTOMER_CODE_MAP = {
  'MSIL Manesar': '1231',
  'MSIL Kharkhoda': '1640',
  'MSIL Gurgaon': '1642'
} as const;

export const MSIL_CUSTOMERS = ['MSIL Manesar', 'MSIL Kharkhoda', 'MSIL Gurgaon'] as const;

export type MSILCustomerName = typeof MSIL_CUSTOMERS[number];

/**
 * Get customer code from customer name
 * @param customerName - The customer name (e.g., "MSIL Manesar")
 * @returns The customer code (e.g., "1231") or null if not found
 */
export function getCustomerCode(customerName: string | null | undefined): string | null {
  if (!customerName) return null;
  return CUSTOMER_CODE_MAP[customerName as MSILCustomerName] || null;
}

/**
 * Get customer name from customer code
 * @param customerCode - The customer code (e.g., "1231")
 * @returns The customer name (e.g., "MSIL Manesar") or null if not found
 */
export function getCustomerName(customerCode: string | null | undefined): string | null {
  if (!customerCode) return null;
  
  const entry = Object.entries(CUSTOMER_CODE_MAP).find(
    ([, code]) => code === customerCode
  );
  
  return entry ? entry[0] : null;
}

/**
 * Check if a customer code is a valid MSIL customer code
 * @param customerCode - The customer code to validate
 * @returns True if the code is valid, false otherwise
 */
export function isValidMSILCustomerCode(customerCode: string | null | undefined): boolean {
  if (!customerCode) return false;
  return Object.values(CUSTOMER_CODE_MAP).includes(customerCode as any);
}

/**
 * Check if a customer name is a valid MSIL customer
 * @param customerName - The customer name to validate
 * @returns True if the name is valid, false otherwise
 */
export function isValidMSILCustomer(customerName: string | null | undefined): boolean {
  if (!customerName) return false;
  return MSIL_CUSTOMERS.includes(customerName as any);
}

