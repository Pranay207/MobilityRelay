export const compareInstants = (left: string, right: string) => Date.parse(left) - Date.parse(right);
export const utcDate = (value: string) => new Date(value).toISOString().slice(0, 10);
