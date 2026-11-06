import { StackSeparator, VStack } from '@chakra-ui/react'
import { useAtomValue } from 'jotai'
import { commandsAtom } from '../../../../command/commandsAtom'
import { Hotkey } from '../Hotkey'

export const CommandPlatteShortcutKeys = () => {
	const commands = useAtomValue(commandsAtom)
	const commandsRunnable = commands
		.filter(c => c.type === 'run')

	return (
		<VStack
			width='full'
			separator={
				<StackSeparator></StackSeparator>
			}
		>
			{commandsRunnable.map((c, i) => (
				<Hotkey
					itemData={{
						id: `command_platte.shortcuts.${c.id}`,
						name: c.name
					}}
					key={i}
				></Hotkey>
			))}
		</VStack>
	)
}
