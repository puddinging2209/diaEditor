import { Checkbox } from './Checkbox'
import { Color } from './Color'
import { AppInfo } from './custom/AppInfo'
import { CommandPlatteShortcutKeys } from './custom/CommandPlatteShortcutKeys'
import { Licenses } from './custom/Licenses'
import { Group } from './Group'
import { Hotkey } from './Hotkey'
import { Link } from './Link'
import { NumberInput } from './Number'
import { Select } from './Select'
import { Slider } from './Slider'

export const settingTypes = {
	'group': {
		id: 'group',
		component: Group
	},
	'checkbox': {
		id: 'checkbox',
		component: Checkbox
	},
	'number': {
		id: 'number',
		component: NumberInput
	},
	'slider': {
		id: 'slider',
		component: Slider
	},
	'select': {
		id: 'select',
		component: Select
	},
	'color': {
		id: 'color',
		component: Color
	},
	'hotkey': {
		id: 'hotkey',
		component: Hotkey
	},
	'link': {
		id: 'link',
		component: Link
	},

	'custom_app_info': {
		id: 'custom_app_info',
		component: AppInfo
	},
	'custom_licenses': {
		id: 'custom_licenses',
		component: Licenses
	},
	'custom_command_platte_shortcut_keys': {
		id: 'custom_command_platte_shortcut_keys',
		component: CommandPlatteShortcutKeys
	}
}
