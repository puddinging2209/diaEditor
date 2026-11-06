import { Accordion, Button, Center, CloseButton, Dialog, Link, Portal, SimpleGrid, Spinner, Text, VStack } from '@chakra-ui/react'
import { Suspense, use } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

const fetchText = async path => {
	return await (await fetch(`./licenses/${path}`)).text()
}

let licensesCache = new Map()

const fetchData = path => {
	if (!licensesCache.has(path)) {
		licensesCache.set(path, fetchText(path))
	}
	return licensesCache.get(path)
}

const LicenseText = ({ index }) => {
	const text = use(fetchData(`${index}.txt`))
	return (
		<Text fontFamily='monospace' whiteSpace='pre' userSelect='text'>
			{text}
		</Text>
	)
}

const LicenseList = () => {
	const licenseJson = use(fetchData('licenses.json'))
	const licenses = JSON.parse(licenseJson)
	return (
		<Accordion.Root collapsible lazyMount={true}>
			{
				Object.entries(licenses).map(([name, d], i) => (
					<Accordion.Item key={i} value={name}>
						<Accordion.ItemTrigger>
							<Text flex="1">{name}</Text>
							<Accordion.ItemIndicator />
						</Accordion.ItemTrigger>
						<Accordion.ItemContent>
							<Accordion.ItemBody>
								<Link href={d.repository} target='_blank' colorPalette='teal'>{d.repository}</Link>
								<Suspense fallback={
									<Center>
										<Spinner size='lg'></Spinner>
									</Center>
								}>
									<LicenseText index={i}></LicenseText>
								</Suspense>
							</Accordion.ItemBody>
						</Accordion.ItemContent>
					</Accordion.Item>
				))
			}
		</Accordion.Root>
	)
}

export const Licenses = () => {
	return (
		<SimpleGrid
			width='full'
			minHeight='3rem'
			templateColumns='1fr max-content'
			alignItems='center'
			gap={4}
		>
			<VStack alignItems='flex-start' gap={0.5}>
				<Text>ライセンスを確認する</Text>
			</VStack>

			<Dialog.Root size='cover'>
				<Dialog.Trigger asChild>
					<Button variant="outline" size="md">
						開く
					</Button>
				</Dialog.Trigger>
				<Portal>
					<Dialog.Backdrop />
					<Dialog.Positioner>
						<Dialog.Content>
							<Dialog.Header>
								<Dialog.Title>ライセンス情報</Dialog.Title>
							</Dialog.Header>
							<Dialog.Body overflowY='auto'>
								<ErrorBoundary fallback={'読み込みエラー'}>
									<Suspense fallback={
										<Center>
											<Spinner size='lg'></Spinner>
										</Center>
									}>
										<LicenseList></LicenseList>
									</Suspense>
								</ErrorBoundary>
							</Dialog.Body>
							<Dialog.CloseTrigger asChild>
								<CloseButton size="sm" />
							</Dialog.CloseTrigger>
						</Dialog.Content>
					</Dialog.Positioner>
				</Portal>
			</Dialog.Root>
		</SimpleGrid>
	)
}
