import { VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingPageItems } from '../../../data/settings'
import { pageIdAtom } from '../states/page'
import { SettingItem } from './SettingItem'

export const SettingsList = () => {
	const [pageId, setPageId] = useAtom(pageIdAtom)

	return (
		<VStack
			paddingInline={4}
			width='full'
			maxWidth='800px'
			gap={8}
		>
			{settingPageItems[pageId].items.map((e, i) => <SettingItem itemData={e} key={i}></SettingItem>)}
		</VStack>
	)
}
