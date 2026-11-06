import { Button, HStack, Kbd, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { settingAtom } from '../../../../state/settingAtom'
import { getKeyName } from '../../../../util/keyName'

export const Hotkey = ({ itemData }) => {
	const itemAtom = settingAtom(itemData.id)
	const [value, setValue] = useAtom(itemAtom)
	const [isCapturing, setIsCapturing] = useState(false)

	const handleKeyDown = e => {
		e.preventDefault()
		if (e.key === 'Enter') {
			return
		}
		if (e.key === 'Escape') {
			setValue([])
			setIsCapturing(false)
			return
		}
		const keyName = getKeyName(e.key)
		if (value?.includes?.(keyName)) {
			return
		}
		setValue([...(value ?? []), keyName])
	}
	const handleKeyUp = e => {
		if (e.key === 'Enter') {
			return
		}
		setIsCapturing(false)
	}

	useEffect(() => {
		if (!isCapturing) return

		const onKeyDown = event => {
			handleKeyDown(event)
		}

		const onKeyUp = event => {
			handleKeyUp(event)
		}

		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('keyup', onKeyUp)

		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('keyup', onKeyUp)
		}
	}, [isCapturing, handleKeyDown, handleKeyUp])

	return (
		<SimpleGrid
			width='full'
			minHeight='3rem'
			templateColumns='1fr max-content'
			alignItems='center'
			gap={4}
		>
			<VStack alignItems='flex-start' gap={0.5}>
				<Text>{itemData.name}</Text>
				<Text color='fg.muted' fontSize='sm'>{itemData.description}</Text>
			</VStack>

			<Button
				variant={isCapturing ? 'solid' : 'outline'}
				outline={isCapturing ? 'solid red 2px' : null}
				onClick={() => {
					setIsCapturing(true)
					setValue([])
				}}
			>
				<HStack>
					{
						value?.length ?
							value.map(k => (
								<Kbd key={k}>{k}</Kbd>
							)) :
							isCapturing ? 'キー検知中...' : '未設定'
					}
				</HStack>
			</Button>
		</SimpleGrid>
	)
}
