import fs from 'fs'
import checker from 'license-checker'

export const generateLicenses = () => ({
	name: 'generate-licenses',
	buildStart() {
		if (!fs.existsSync('public/licenses/')) {
			fs.mkdirSync('public/licenses/')
		}
		checker.init({ start: './' }, (err, packages) => {
			fs.writeFileSync('public/licenses/licenses.json', JSON.stringify(packages))
			Object.values(packages).forEach((p, i) => {
				fs.copyFileSync(p.licenseFile, `public/licenses/${i}.txt`)
			})
		})
	}
})
