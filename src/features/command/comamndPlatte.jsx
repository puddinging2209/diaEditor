import { Input, VStack } from '@chakra-ui/react'
import Fuse from 'fuse.js'
import { useAtomValue, useStore } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { settingAtom } from '../../state/settingAtom'
import { isArraySetSame } from '../../util/arraySetSame'
import { getKeyName } from '../../util/keyName'
import { mod } from '../../util/math'
import { commandsAtom } from './commandsAtom'
import { CommandItem } from './components/commandItem'

export const CommandPlatte = () => {
	const [isOpen, setIsOpen] = useState(false)
	const [input, setInput] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const store = useStore()
	const inputRef = useRef(null)
	const pressKeysSetRef = useRef(new Set())
	const startKeyAtom = settingAtom('command_platte.start_key')
	const startKey = useAtomValue(startKeyAtom) ?? []

	const commandsRaw = useAtomValue(commandsAtom)

	const parseInput = input => {
		const parts = input.split('.')
		return {
			namespaceInput: parts.slice(0, -1).join('.'),
			searchInput: parts.at(-1) ?? ''
		}
	}

	const normalizeCommands = (commands, namespaceInput) => {
		const depth = namespaceInput ? namespaceInput.split('.').length : 0

		return commands
			.map(c => {
				const idParts = c.id.split('.')
				return {
					...c,
					namespace: idParts.slice(0, -1).join('.'),
					idTrimmed: idParts.slice(depth === 1 ? 0 : depth).join('.')
				}
			})
			.filter(c => c.namespace.startsWith(namespaceInput))
	}

	const searchCommands = (commands, searchInput) => {
		const fuse = new Fuse(commands, {
			includeScore: true,
			keys: ['name', 'idTrimmed', 'namespace'],
			threshold: 0.4,
			ignoreLocation: false
		})

		return fuse
			.search(searchInput)
			.map(r => r.item)
			.toSorted((a, b) => a.id.split('.').length - b.id.split('.').length)
	}

	const { namespaceInput, searchInput } = parseInput(input)
	const commands = normalizeCommands(commandsRaw, namespaceInput)
	const commandFiltered = searchCommands(commands, searchInput)

	const run = index => {
		const command = commandFiltered[index]
		if (!command) return

		if (command.type === 'run') {
			command.run(store.get, store.set)
			setInput('')
			setIsOpen(false)
		} else if (command.type === 'complement') {
			setInput(`${command.id}.`)
			setSelectedIndex(0)
		}
	}

	const handleKeyDown = e => {
		const keyName = getKeyName(e.key)
		pressKeysSetRef.current.add(keyName)
		if (isArraySetSame(startKey, pressKeysSetRef.current)) {
			setIsOpen(!isOpen)
		}
		if (!isOpen) {
			const commandsRunnable = commandsRaw
				.filter(c => c.type === 'run')
			commandsRunnable.forEach(c => {
				const key = store.get(settingAtom(`command_platte.shortcuts.${c.id}`))
				if (key && isArraySetSame(key, pressKeysSetRef.current)) {
					c.run(store.get, store.set)
				}
			})
			return
		}

		switch (e.key) {
			case 'ArrowDown':
				setSelectedIndex(i => mod(i + 1, commandFiltered.length))
				e.preventDefault()
				break
			case 'ArrowUp':
				setSelectedIndex(i => mod(i - 1, commandFiltered.length))
				e.preventDefault()
				break
			case 'Enter':
				run(selectedIndex)
				break
			case 'Tab': {
				const command = commandFiltered[selectedIndex]
				if (!command) break
				setInput(command.id + (command.type === 'complement' ? '.' : ''))
				setSelectedIndex(0)
				e.preventDefault()
				break
			}
			case 'Escape':
				setInput('')
				setIsOpen(false)
				break
			default:
				setSelectedIndex(0)
		}
	}
	const handleKeyUp = e => {
		const keyName = getKeyName(e.key)
		pressKeysSetRef.current.delete(keyName)
	}

	useEffect(() => {
		document.addEventListener('keydown', handleKeyDown)
		document.addEventListener('keyup', handleKeyUp)
		return () => {
			document.removeEventListener('keydown', handleKeyDown)
			document.removeEventListener('keyup', handleKeyUp)
		}
	})

	useEffect(() => {
		if (isOpen) {
			inputRef.current?.focus?.()
		} else {
			inputRef.current?.blur?.()
		}
	}, [isOpen])

	return (
		<VStack
			width='full'
			translate='0px calc(50% - calc(2rem / 2))'
			borderRadius='md'
			background='bg.muted'
			shadow={isOpen ? 'md' : null}
			tabIndex={-1}
			onFocus={e => {
				setIsOpen(true)
			}}
			onBlur={e => {
				if (!e.currentTarget.contains(e.relatedTarget)) {
					setIsOpen(false)
				}
			}}
		>
			<Input
				size='xs'
				background='bg.emphasized'
				placeholder='コマンドパレット...'
				value={input}
				ref={inputRef}
				tabIndex={-1}
				autoComplete='off'
				spellCheck='false'
				onChange={e => setInput(e.target.value)}
			/>
			<VStack
				width='full'
				height='400px'
				display={isOpen ? null : 'none'}
				overflowX='hidden'
				overflowY='auto'
			>
				{commandFiltered.map((c, i) => (
					<CommandItem
						key={c.id}
						itemData={c}
						selected={i === selectedIndex}
						run={() => {
							run(i)
						}}
					/>
				))}
			</VStack>
		</VStack>
	)
}
