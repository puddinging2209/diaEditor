const keyNameMap = {
	' ': 'Space',
}

export const getKeyName = name => {
	if (keyNameMap[name]) {
		return keyNameMap[name]
	}
	if (name.length === 1) {
		return name.toUpperCase()
	}
	return name
}
