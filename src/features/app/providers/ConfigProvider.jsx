import { ChakraProvider, createSystem, defaultConfig, defineConfig, Theme } from "@chakra-ui/react"
import { argbFromHex, DynamicScheme, Hct, hexFromArgb, Variant } from '@material/material-color-utilities'
import { useAtomValue } from "jotai"
import { useEffect, useMemo, useRef } from "react"
import { settingAtom } from '../../../state/settingAtom'

const createConfig = accentColor => {
	const argb = argbFromHex(accentColor)
	const scheme = new DynamicScheme({
		sourceColorHct: Hct.fromInt(argb),
		variant: Variant.CONTENT,
		contrastLevel: 0,
		isDark: true
	})

	const tones = {
		50: 95, 100: 92, 200: 87, 300: 80, 400: 70,
		500: 50, 600: 40, 700: 30, 800: 20, 900: 11, 950: 4
	}

	const getPalette = (palette) => {
		const colors = {}
		Object.entries(tones).forEach(([weight, tone]) => {
			colors[weight] = hexFromArgb(palette.tone(tone))
		})
		return colors
	}

	const colors = {
		primary: getPalette(scheme.primaryPalette),
		neutral: getPalette(scheme.neutralPalette),
		neutralVariant: getPalette(scheme.neutralVariantPalette),
	}

	return createSystem(defaultConfig,
		defineConfig({
			theme: {
				tokens: {
					colors: {
						gray: colors.neutralVariant,
						brand: colors.primary,
					}
				},
				semanticTokens: {
					colors: {
						'fg': { value: { _light: 'black', _dark: colors.neutral[100] } },
						'fg.muted': { value: { _light: colors.neutral[600], _dark: colors.neutral[400] } },
						'fg.subtle': { value: { _light: colors.neutral[400], _dark: colors.neutral[500] } },
						'fg.inverted': { value: { _light: colors.neutral[100], _dark: 'black' } },
						'gray-solid': { value: { _light: colors.primary[700], _dark: colors.primary[100] } },
					}
				},
			}
		})
	)
}

export const ConfigProvider = ({ children }) => {
	const themeColorAtom = settingAtom('theme_color')
	const themeModeAtom = settingAtom('theme_mode')
	const themeColor = useAtomValue(themeColorAtom)
	const themeMode = useAtomValue(themeModeAtom)

	const theme = useMemo(
		() => createConfig(themeColor ?? '#ffffff'),
		[themeColor]
	)

	const visibleRef = useRef(null)

	const setThemeColor = () => {
		const meta = document.querySelector('meta[name="theme-color"]')
		meta.setAttribute('content', null)
		meta.setAttribute('content',
			navigator.windowControlsOverlay.visible
				? getComputedStyle(document.documentElement).getPropertyValue('--chakra-colors-bg-muted')
				: null
		)
	}

	useEffect(() => {
		navigator.windowControlsOverlay.addEventListener('geometrychange', () => {
			if (navigator.windowControlsOverlay.visible !== visibleRef.current) {
				setThemeColor()
			}
			visibleRef.current = navigator.windowControlsOverlay.visible
		})
		setThemeColor()
	}, [])

	useEffect(() => {
		setThemeColor()
	}, [themeColor])

	return (
		<ChakraProvider value={theme}>
			<Theme appearance={themeMode === 'system' ? undefined : themeMode}>
				{children}
			</Theme>
		</ChakraProvider>
	)
}
