export const isArraySetSame = (array, set) => {
	if (set.size !== array.length) {
		return false
	}

	return array.every(value => set.has(value))
}
